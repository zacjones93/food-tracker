import { DurableObject } from "cloudflare:workers";

import { runAssistant } from "./assistant";
import {
  AssistantWorkerError,
  type AssistantRequestContext,
  parseAssistantRequestContext,
} from "./context";
import { assertAuthorizedChat } from "./persistence";

interface StreamRunState {
  chatId: string;
  runId: string;
  status: "running" | "completed" | "aborted" | "error";
  chunkCount: number;
  updatedAt: number;
}

interface StreamSubscriber {
  controller: ReadableStreamDefaultController<Uint8Array>;
  pending: Uint8Array[];
  isReplaying: boolean;
  closeOnTerminal: boolean;
}

const ACTIVE_RUN_KEY = "active-run";
const CHUNK_PREFIX = "stream-chunk:";
const encoder = new TextEncoder();

function chunkKey({ runId, index }: { runId: string; index: number }): string {
  return `${CHUNK_PREFIX}${runId}:${String(index).padStart(10, "0")}`;
}

function copyChunk(chunk: Uint8Array): Uint8Array {
  return new Uint8Array(chunk);
}

function runErrorEvent({
  chatId,
  runId,
  message,
}: {
  chatId: string;
  runId: string;
  message: string;
}): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify({
    type: "RUN_ERROR",
    threadId: chatId,
    runId,
    timestamp: Date.now(),
    message,
  })}\n\n`);
}

export class AssistantChatSession extends DurableObject<AssistantWorkerEnv> {
  private readonly subscribers = new Set<StreamSubscriber>();
  private activeAbortController: AbortController | null = null;
  private activeRunPromise: Promise<void> | null = null;

  constructor(ctx: DurableObjectState, env: AssistantWorkerEnv) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      const interrupted = await ctx.storage.get<StreamRunState>(ACTIVE_RUN_KEY);
      if (interrupted?.status !== "running") return;
      const chunk = runErrorEvent({
        chatId: interrupted.chatId,
        runId: interrupted.runId,
        message: "The assistant was interrupted. Please retry.",
      });
      await this.persistChunk({
        chatId: interrupted.chatId,
        runId: interrupted.runId,
        index: interrupted.chunkCount,
        chunk,
      });
      await this.setRunState({
        chatId: interrupted.chatId,
        runId: interrupted.runId,
        status: "error",
        chunkCount: interrupted.chunkCount + 1,
      });
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const context = parseAssistantRequestContext(request);
    await assertAuthorizedChat({ db: this.env.DB, context });

    if (request.method === "POST" && url.pathname === "/runs") {
      return this.startRun({ request, context });
    }
    if (request.method === "POST" && url.pathname === "/events") {
      return this.subscribe({ request });
    }
    if (request.method === "POST" && url.pathname === "/cancel") {
      return this.cancelRun({ context });
    }
    if (request.method === "POST" && url.pathname === "/delete") {
      return this.deleteStoredData();
    }
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  private async startRun({
    request,
    context,
  }: {
    request: Request;
    context: AssistantRequestContext;
  }): Promise<Response> {
    const current = await this.ctx.storage.get<StreamRunState>(ACTIVE_RUN_KEY);
    if (current?.status === "running") {
      if (current.runId === context.runId) {
        return Response.json({ accepted: true, runId: context.runId }, { status: 202 });
      }
      throw new AssistantWorkerError("RUN_IN_PROGRESS", "An assistant run is already active", 409);
    }

    const requestBody = await request.json();
    await this.clearStoredChunks();
    await this.ctx.storage.put<StreamRunState>(ACTIVE_RUN_KEY, {
      chatId: context.chatId,
      runId: context.runId,
      status: "running",
      chunkCount: 0,
      updatedAt: Date.now(),
    });

    const abortController = new AbortController();
    this.activeAbortController = abortController;
    const runPromise = this.pumpRun({ requestBody, context, abortController });
    this.activeRunPromise = runPromise;
    this.ctx.waitUntil(runPromise);
    const clearActiveRun = () => {
      if (this.activeRunPromise === runPromise) this.activeRunPromise = null;
      if (this.activeAbortController === abortController) this.activeAbortController = null;
    };
    void runPromise.then(clearActiveRun, clearActiveRun);

    return Response.json({ accepted: true, runId: context.runId }, { status: 202 });
  }

  private async pumpRun({
    requestBody,
    context,
    abortController,
  }: {
    requestBody: unknown;
    context: AssistantRequestContext;
    abortController: AbortController;
  }): Promise<void> {
    let chunkCount = 0;
    try {
      const response = await runAssistant({
        requestBody,
        env: this.env,
        context,
        signal: abortController.signal,
      });
      if (!response.ok || !response.body) {
        throw new Error("Assistant stream could not be started");
      }

      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = copyChunk(value);
        await this.persistChunk({
          chatId: context.chatId,
          runId: context.runId,
          index: chunkCount,
          chunk,
        });
        chunkCount += 1;
        this.broadcast(chunk);
      }

      await this.setRunState({
        chatId: context.chatId,
        runId: context.runId,
        status: abortController.signal.aborted ? "aborted" : "completed",
        chunkCount,
      });
      this.closeTerminalSubscribers();
    } catch (error) {
      const chunk = runErrorEvent({
        chatId: context.chatId,
        runId: context.runId,
        message: abortController.signal.aborted
          ? "Assistant response stopped"
          : "The assistant could not finish that response",
      });
      await this.persistChunk({
        chatId: context.chatId,
        runId: context.runId,
        index: chunkCount,
        chunk,
      });
      chunkCount += 1;
      this.broadcast(chunk);
      await this.setRunState({
        chatId: context.chatId,
        runId: context.runId,
        status: abortController.signal.aborted ? "aborted" : "error",
        chunkCount,
      });
      this.closeTerminalSubscribers();
      console.error(JSON.stringify({
        scope: "assistant-chat-session",
        event: "run.failed",
        runId: context.runId,
        errorName: error instanceof Error ? error.name : "UnknownError",
      }));
    }
  }

  private async subscribe({ request }: { request: Request }): Promise<Response> {
    const body = await request.json().catch(() => ({})) as {
      knownRunIds?: unknown;
      closeOnTerminal?: unknown;
      replayRunId?: unknown;
    };
    const closeOnTerminal = body.closeOnTerminal === true;
    const replayRunId = typeof body.replayRunId === "string" ? body.replayRunId : null;
    const current = await this.ctx.storage.get<StreamRunState>(ACTIVE_RUN_KEY);
    if (
      closeOnTerminal &&
      (!current || (current.status !== "running" && current.runId !== replayRunId))
    ) {
      return new Response(null, { status: 204 });
    }
    const knownRunIds = new Set(
      Array.isArray(body.knownRunIds)
        ? body.knownRunIds.filter((value): value is string => typeof value === "string")
        : [],
    );
    let subscriber: StreamSubscriber | null = null;
    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        subscriber = {
          controller,
          pending: [],
          isReplaying: true,
          closeOnTerminal,
        };
        this.subscribers.add(subscriber);
        controller.enqueue(encoder.encode(": connected\n\n"));
        void this.replayCurrentRun({ subscriber, knownRunIds });
      },
      cancel: () => {
        if (subscriber) this.subscribers.delete(subscriber);
      },
    });

    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
      },
    });
  }

  private async replayCurrentRun({
    subscriber,
    knownRunIds,
  }: {
    subscriber: StreamSubscriber;
    knownRunIds: Set<string>;
  }): Promise<void> {
    try {
      const state = await this.ctx.storage.get<StreamRunState>(ACTIVE_RUN_KEY);
      const snapshotCount = state?.chunkCount ?? 0;
      if (state && !knownRunIds.has(state.runId)) {
        for (let index = 0; index < snapshotCount; index += 1) {
          const stored = await this.ctx.storage.get<ArrayBuffer>(
            chunkKey({ runId: state.runId, index }),
          );
          if (stored) subscriber.controller.enqueue(new Uint8Array(stored));
        }
      }
      subscriber.isReplaying = false;
      subscriber.pending.forEach((chunk) => subscriber.controller.enqueue(chunk));
      subscriber.pending = [];
      const latestState = subscriber.closeOnTerminal
        ? await this.ctx.storage.get<StreamRunState>(ACTIVE_RUN_KEY)
        : state;
      if (subscriber.closeOnTerminal && latestState?.status !== "running") {
        this.subscribers.delete(subscriber);
        subscriber.controller.close();
      }
    } catch (error) {
      this.subscribers.delete(subscriber);
      subscriber.controller.error(error);
    }
  }

  private async cancelRun({ context }: { context: AssistantRequestContext }): Promise<Response> {
    const current = await this.ctx.storage.get<StreamRunState>(ACTIVE_RUN_KEY);
    if (!current || current.status !== "running") {
      return Response.json({ cancelled: false }, { status: 200 });
    }
    if (current.runId !== context.runId) {
      throw new AssistantWorkerError("CONTEXT_MISMATCH", "Assistant run mismatch", 409);
    }
    this.activeAbortController?.abort("user-cancelled");
    return Response.json({ cancelled: true, runId: current.runId }, { status: 202 });
  }

  private async deleteStoredData(): Promise<Response> {
    this.activeAbortController?.abort("account-deleted");
    await this.activeRunPromise?.catch(() => undefined);

    this.subscribers.forEach((subscriber) => {
      try {
        subscriber.controller.close();
      } catch {
        // The client may already have closed the stream.
      }
    });
    this.subscribers.clear();
    await this.ctx.storage.deleteAll();

    return Response.json({ deleted: true });
  }

  private async persistChunk({
    chatId,
    runId,
    index,
    chunk,
  }: {
    chatId: string;
    runId: string;
    index: number;
    chunk: Uint8Array;
  }): Promise<void> {
    const stored = chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength);
    await this.ctx.storage.put(chunkKey({ runId, index }), stored);
    await this.ctx.storage.put<StreamRunState>(ACTIVE_RUN_KEY, {
      chatId,
      runId,
      status: "running",
      chunkCount: index + 1,
      updatedAt: Date.now(),
    });
  }

  private async setRunState({
    chatId,
    runId,
    status,
    chunkCount,
  }: Omit<StreamRunState, "updatedAt">): Promise<void> {
    await this.ctx.storage.put<StreamRunState>(ACTIVE_RUN_KEY, {
      chatId,
      runId,
      status,
      chunkCount,
      updatedAt: Date.now(),
    });
  }

  private broadcast(chunk: Uint8Array): void {
    this.subscribers.forEach((subscriber) => {
      try {
        if (subscriber.isReplaying) subscriber.pending.push(copyChunk(chunk));
        else subscriber.controller.enqueue(chunk);
      } catch {
        this.subscribers.delete(subscriber);
      }
    });
  }

  private closeTerminalSubscribers(): void {
    this.subscribers.forEach((subscriber) => {
      if (!subscriber.closeOnTerminal || subscriber.isReplaying) return;
      try {
        subscriber.controller.close();
      } finally {
        this.subscribers.delete(subscriber);
      }
    });
  }

  private async clearStoredChunks(): Promise<void> {
    const chunks = await this.ctx.storage.list({ prefix: CHUNK_PREFIX });
    if (chunks.size > 0) await this.ctx.storage.delete([...chunks.keys()]);
  }
}
