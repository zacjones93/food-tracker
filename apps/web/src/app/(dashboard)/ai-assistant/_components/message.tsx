import type { AssistantMessage } from "@/lib/assistant/types";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MessageProps {
  message: AssistantMessage;
  onApproval: (approvalId: string, approved: boolean) => void;
}

function formatToolOutput(output: unknown): string {
  if (typeof output === "string") return output;
  try {
    return JSON.stringify(output, null, 2);
  } catch {
    return "Tool result unavailable";
  }
}

export function Message({ message, onApproval }: MessageProps) {
  return (
    <div className="flex flex-col gap-3">
      {message.parts.map((part, index) => {
        if (part.type === "text") {
          return (
            <div key={index} className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{part.content}</ReactMarkdown>
            </div>
          );
        }
        if (part.type === "thinking") {
          return <p key={index} className="text-xs italic text-muted-foreground">Thinking…</p>;
        }
        if (part.type === "tool-call") {
          const approval = part.approval;
          return (
            <div key={part.id} className="rounded-md border bg-background/60 p-3 text-xs">
              <div className="font-medium">Tool: {part.name}</div>
              <div className="mt-1 text-muted-foreground">Status: {part.state}</div>
              {approval?.needsApproval && approval.approved === undefined && (
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    className="rounded bg-primary px-3 py-1 text-primary-foreground"
                    onClick={() => onApproval(approval.id, true)}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className="rounded border px-3 py-1"
                    onClick={() => onApproval(approval.id, false)}
                  >
                    Deny
                  </button>
                </div>
              )}
              {part.output !== undefined && (
                <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap">
                  {formatToolOutput(part.output)}
                </pre>
              )}
            </div>
          );
        }
        if (part.type === "tool-result") {
          return (
            <pre key={`${part.toolCallId}-${index}`} className="max-h-64 overflow-auto rounded-md border p-3 text-xs whitespace-pre-wrap">
              {formatToolOutput(part.content)}
            </pre>
          );
        }
        return null;
      })}
    </div>
  );
}
