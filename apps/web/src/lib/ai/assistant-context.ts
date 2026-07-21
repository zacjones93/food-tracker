export interface AssistantRecipePageContext {
  kind: "recipe";
  entityId: string;
  label: string;
  href: string;
}

export interface AssistantWeekPageContext {
  kind: "week";
  entityId: string;
  label: string;
  href: string;
  view?: {
    section?: "meals" | "groceries";
  };
}

export type AssistantPageContext =
  | AssistantRecipePageContext
  | AssistantWeekPageContext;

export interface AssistantSettings {
  monthlyBudgetUsd: number;
  maxTokensPerRequest: number;
  maxRequestsPerDay: number;
}

export function getAssistantContextKey(context: AssistantPageContext | null) {
  if (!context) return null;
  const section = context.kind === "week" ? context.view?.section ?? "" : "";
  return `${context.kind}:${context.entityId}:${context.label}:${context.href}:${section}`;
}

export function getAssistantContextSuggestions(context: AssistantPageContext | null) {
  if (context?.kind === "recipe") {
    return [
      "What would pair well with this recipe?",
      "Help me plan when to make this",
      "Suggest a useful variation",
    ];
  }

  if (context?.kind === "week") {
    return context.view?.section === "groceries"
      ? [
          "Review this grocery list for anything missing",
          "Group these items into an efficient shopping plan",
          "Which recipes use the same ingredients?",
        ]
      : [
          "Help me fill the gaps in this week",
          "Balance the effort across these meals",
          "What should I prep first?",
        ];
  }

  return [
    "Find three dinner ideas",
    "Help me plan this week",
    "Find a recipe I have not made lately",
  ];
}
