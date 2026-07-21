import type { Tool } from "@tanstack/ai";

export const READ_ONLY_TOOL_MANIFEST = {
  recipes: ["search", "getMany", "facets"],
  weeks: ["search", "getMany", "findForRecipes"],
  recipeBooks: ["search"],
  groceryTemplates: ["search"],
  groceryItems: ["search"],
  weekRecipes: ["search"],
  recipeRelations: ["search"],
  settings: ["getFoodPlanning"],
} as const;

export interface ReadOnlyToolNamespace {
  name: keyof typeof READ_ONLY_TOOL_MANIFEST;
  tools: Tool[];
}

export function assertReadOnlyToolNamespaces(namespaces: ReadOnlyToolNamespace[]): void {
  const actual = Object.fromEntries(
    namespaces.map((namespace) => [namespace.name, namespace.tools.map((tool) => tool.name)]),
  );
  if (JSON.stringify(actual) !== JSON.stringify(READ_ONLY_TOOL_MANIFEST)) {
    throw new Error("Code Mode tool allowlist mismatch");
  }
  for (const namespace of namespaces) {
    for (const tool of namespace.tools) {
      if (!tool.execute || tool.needsApproval) {
        throw new Error(`Unsafe Code Mode tool: ${namespace.name}.${tool.name}`);
      }
    }
  }
}
