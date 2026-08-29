import { getAssistantErrorMessage } from "@/lib/assistant/errors";
import type { AssistantMessage } from "@/lib/assistant/types";
import { Check, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MessageProps {
  message: AssistantMessage;
  pendingApprovalIds: ReadonlySet<string>;
  onApproval: (decision: { approvalId: string; approved: boolean }) => void;
}

export function Message({ message, pendingApprovalIds, onApproval }: MessageProps) {
  const firstToolErrorIndex = message.parts.findIndex((part) =>
    (part.type === "tool-call" || part.type === "tool-result") && part.state === "error"
  );

  return (
    <div className="flex flex-col gap-3">
      {message.parts.map((part, index) => {
        const isToolError =
          (part.type === "tool-call" || part.type === "tool-result") && part.state === "error";
        if (isToolError) {
          if (index !== firstToolErrorIndex) return null;
          return (
            <p key={`tool-error-${index}`} role="alert" className="text-sm text-destructive">
              {getAssistantErrorMessage("CODE_MODE_EXECUTION_FAILED")}
            </p>
          );
        }
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
          const isComplete = part.state === "complete";
          const isWaitingForApproval =
            approval?.needsApproval &&
            approval.approved === undefined &&
            pendingApprovalIds.has(approval.id);
          return (
            <div
              key={part.id}
              className="rounded-md border bg-background/60 p-3 text-xs"
              role="status"
              aria-live="polite"
            >
              <div className="flex items-center gap-2 font-medium text-muted-foreground">
                {isComplete ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                )}
                <span>
                  {isWaitingForApproval
                    ? "Agent is ready to make changes"
                    : isComplete
                      ? "Agent finished using a tool"
                      : "Agent is using a tool…"}
                </span>
              </div>
              {isWaitingForApproval && (
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    className="rounded bg-primary px-3 py-1 text-primary-foreground"
                    onClick={() => onApproval({ approvalId: approval.id, approved: true })}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className="rounded border px-3 py-1"
                    onClick={() => onApproval({ approvalId: approval.id, approved: false })}
                  >
                    Deny
                  </button>
                </div>
              )}
            </div>
          );
        }
        if (part.type === "tool-result") return null;
        return null;
      })}
    </div>
  );
}
