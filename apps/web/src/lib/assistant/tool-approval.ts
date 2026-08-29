interface AssistantInterruptSummary {
  readonly id: string;
  readonly kind: string;
  readonly status: string;
  readonly canResolve: boolean;
}

interface ResolvableGenericAssistantApproval extends AssistantInterruptSummary {
  readonly kind: "generic";
  resolveInterrupt: (payload: unknown) => void;
}

interface ResolvableTypedAssistantApproval extends AssistantInterruptSummary {
  readonly kind: "tool-approval";
  resolveInterrupt: (approved: boolean) => void;
}

type ResolvableAssistantApproval =
  | ResolvableGenericAssistantApproval
  | ResolvableTypedAssistantApproval;

export function getPendingAssistantToolApprovalIds({
  interrupts,
}: {
  interrupts: ReadonlyArray<AssistantInterruptSummary>;
}): ReadonlySet<string> {
  return new Set(
    interrupts
      .filter(
        (interrupt) =>
          (interrupt.kind === "generic" || interrupt.kind === "tool-approval") &&
          interrupt.status === "pending" &&
          interrupt.canResolve,
      )
      .map((interrupt) => interrupt.id),
  );
}

export function resolveAssistantToolApproval({
  interrupt,
  approved,
}: {
  interrupt: ResolvableAssistantApproval | undefined;
  approved: boolean;
}): boolean {
  if (
    !interrupt ||
    interrupt.status !== "pending" ||
    !interrupt.canResolve
  ) {
    return false;
  }

  if (interrupt.kind === "tool-approval") {
    interrupt.resolveInterrupt(approved);
  } else {
    interrupt.resolveInterrupt({ approved });
  }
  return true;
}
