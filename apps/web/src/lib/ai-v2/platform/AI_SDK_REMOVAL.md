# AI SDK removal inventory

The target architecture is TanStack AI only. The existing Vercel AI SDK packages remain in
`apps/web/package.json` only because their consumers are outside this platform seam's owned slice and
must migrate atomically. The new platform runtime does not declare a Vercel AI SDK dependency.

## Direct runtime consumers

| File | Coupling to remove |
| --- | --- |
| `apps/web/src/app/api/chat/route.ts` | `streamText`, `convertToModelMessages`, `validateUIMessages`, `createUIMessageStreamResponse`, `UIMessage`, `InferUITools`, and the Google provider adapter |
| `apps/web/src/lib/ai/title-generation.ts` | `generateText`, `UIMessage`, and the Google provider adapter |
| `apps/web/src/lib/ai/tools/recipe-tools.ts` | AI SDK `tool()` definitions, including mutation tools |
| `apps/web/src/lib/ai/tools/schedule-tools.ts` | AI SDK `tool()` definitions, including mutation tools |
| `apps/web/src/app/(dashboard)/ai-assistant/_components/chat-interface.tsx` | `@ai-sdk/react` `useChat` and `MyUIMessage` |
| `apps/web/src/app/(dashboard)/ai-assistant/_components/message.tsx` | AI SDK-specific `MyUIMessage` and dynamic `tool-*` part rendering |
| `apps/web/package.json` | `ai`, `@ai-sdk/google`, and `@ai-sdk/react` |

## Type, persistence, and protocol coupling

| File | Coupling to remove |
| --- | --- |
| `apps/web/src/lib/ai/chat-actions.ts` | Imports `MyUIMessage` from the legacy route and validates AI SDK message ordering |
| `apps/web/src/lib/ai/message-mapping.ts` | Flattens and reconstructs AI SDK `UIMessage` parts and `tool-*` state strings |
| `apps/web/src/lib/ai/persistence-layer.ts` | Imports `MyUIMessage` and reconstructs AI SDK-specific tool parts |
| `apps/web/src/db/schema.ts` | AI SDK-specific persistence comments and `MyDBUIMessagePart*` aliases; the stored part shape needs a protocol-neutral contract |
| `apps/web/src/db/migrations/0026_add-ai-chat-tables.sql` | Historical AI SDK-specific schema comments; keep the migration immutable, but stop extending this format |
| `apps/web/src/app/api/mobile/assistant/route.ts` | Delegates directly to the legacy `/api/chat` handler |
| `apps/mobile/FoodTracker/Core/AuthStore.swift` | Parses the AI SDK `text-delta` wire event instead of AG-UI SSE incrementally |
| `apps/mobile/README.md` | Documents the AI SDK stream contract |

## Transitive application consumers

- `apps/web/src/app/api/chat/get/route.ts`, `messages/route.ts`, and `update-title/route.ts`
  consume `chat-actions.ts` and its legacy message payload.
- `apps/web/src/app/(dashboard)/ai-assistant/page.tsx` and
  `chat/[chatId]/page.tsx` render the AI SDK-backed `ChatInterface`.
- `apps/web/src/components/nav-ai-chats.tsx` consumes the legacy chat-history route and must switch
  endpoint names in the same cutover if `/api/chat` is removed.
- No source test currently imports an AI SDK package or asserts the AI SDK wire format. New TanStack
  route, message, approval, persistence, and AG-UI contract tests are therefore required before deletion.

The repository also contains historical AI SDK documentation in `ai/diagrams/**`,
`docs/vercel-ai-sdk-integration-report.md`, `docs/ai-chat-implementation-plan.md`, and
`docs/ai/aihero-ai-sdk-report*.md`. Update or archive those references after the runtime cutover;
`docs/ai/tanstack-cloudflare-code-mode-rfc.md` should retain only historical context.

## Ordered atomic deletion wave

1. Define an application-owned `AssistantMessage`/`AssistantMessagePart` contract based on TanStack
   `UIMessage` parts, plus explicit database serializers that do not import an API route.
2. Replace recipe/week reads with TanStack `toolDefinition().server()` tools. Keep mutations out of
   Code Mode and mark direct mutation tools `needsApproval: true`.
3. Implement the authenticated TanStack route with `chat()`, `toServerSentEventsResponse()`, and this
   platform seam's `{ modelAdapter, tools }`. Move title generation to the same adapter boundary.
4. Migrate `chat-actions.ts`, `message-mapping.ts`, the history endpoints, and stored-history readers to
   the application message contract. Preserve legacy rows through an explicit one-way reader.
5. Replace the web hook with `@tanstack/ai-react` `useChat({ connection:
   fetchServerSentEvents(...) })`; render text, tool-call, tool-result, error, and approval parts.
6. Point the mobile route at the TanStack endpoint and replace the Swift buffered `text-delta` parser
   with incremental AG-UI SSE handling.
7. In one compiling commit, delete `ai`, `@ai-sdk/google`, and `@ai-sdk/react` from
   `apps/web/package.json`, regenerate `pnpm-lock.yaml`, and delete the legacy route/types/mappers that
   no longer have readers.

## TanStack capability check

- Streaming: supported through AG-UI SSE with `chat()` and `toServerSentEventsResponse()`.
- React chat state: supported by `@tanstack/ai-react` `useChat`, including messages, loading, errors,
  cancellation, reload, tool results, and approval responses.
- Tool approval/result parts: supported for direct TanStack tools. Cloudflare's stateless Code Mode
  integration intentionally excludes approval-required tools, so mutations must remain direct tools.
- Persistence serialization: TanStack exposes serializable `UIMessage` arrays and a persistence adapter
  contract. Server-side D1 row mapping remains application-owned; this is migration work, not a missing
  chat capability.
- Cloudflare models: `@cloudflare/tanstack-ai` supports Workers AI through the `AI` binding and optional
  AI Gateway routing, which is the model path used by this seam.

Current references:

- <https://tanstack.com/ai/latest/docs/chat/streaming>
- <https://tanstack.com/ai/latest/docs/api/ai-react>
- <https://tanstack.com/ai/latest/docs/tools/tool-approval>
- <https://tanstack.com/ai/latest/docs/chat/persistence>
- <https://tanstack.com/ai/latest/docs/community-adapters/cloudflare>
- <https://developers.cloudflare.com/agents/tools/codemode/tanstack-ai/>

## Concrete compatibility notes

- `@cloudflare/codemode@0.4.3` requires Zod 4 for its TanStack entry point, while this app's current
  `zsa@0.6.0` and `zsa-react@0.2.3` require Zod 3. The local platform runtime package isolates Zod 4;
  the app keeps Zod 3. A root Zod 4 trial caused application type failures and was not retained.
- The Code Mode package advertises `ai@^6` as an optional peer. The selected
  `@cloudflare/codemode/tanstack-ai` JavaScript entry point imports TanStack AI and Zod, not Vercel AI
  SDK. The current install warning is caused by the legacy root `ai@5`; after the atomic deletion wave,
  the optional peer can be absent. This is temporary package friction, not a TanStack capability gap.
- The installed `@cloudflare/tanstack-ai@0.2.1` declarations state that its Gemini adapter accepts only
  credential-based Gateway configuration because the Google SDK lacks custom-fetch support, despite
  current overview documentation showing binding examples for third-party providers. Preserving Gemini
  through `env.AI.gateway()` is therefore blocked on an adapter release or a deliberate credential path.
  This seam uses Workers AI through the generated `AI` binding and does not hide the mismatch with casts.
- Pulling `@cloudflare/codemode@0.4.3` into a Next.js 15 route currently fails the Next webpack phase
  with `UnhandledSchemeError: Reading from "cloudflare:workers" is not handled by plugins`. The import
  originates in `@cloudflare/codemode/dist/index.js`; it is not introduced by application code. Next
  documents `serverExternalPackages` as its opt-out for Route Handler dependency bundling, but
  `next.config.ts` is outside this seam's owned slice and the resulting OpenNext artifact still needs a
  Workers-runtime test before that setting can be accepted. The compile-breaking smoke route was not
  retained. `worker-smoke.ts` instead proves the core adapter against Wrangler's Workers bundler. This is
  an OpenNext/package integration blocker, not a missing TanStack streaming, state, tool, or persistence
  capability.

Relevant bundling references:

- <https://nextjs.org/docs/app/api-reference/config/next-config-js/serverExternalPackages>
- <https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/>
