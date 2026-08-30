import type { Executor, ResolvedProvider } from "@cloudflare/codemode";
import {
  createCodeMode,
  type CodeModeTool,
  type CreateCodeModeResult,
  type ExecutionResult,
  type IsolateDriver,
  type ToolBinding,
} from "@tanstack/ai-code-mode";

import type { ReadOnlyToolNamespace } from "./tool-policy";
import { CHICKEN_RECIPE_SEARCH_EXAMPLE } from "./code-mode-contract";

const BINDING_NAMESPACE = "__codeModeBindings";
const SAFE_IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/u;

const CODE_MODE_TOOL_NAMES = {
  recipes: {
    search: "recipeSearch",
    getMany: "recipeGetMany",
    facets: "recipeFacets",
  },
  weeks: {
    search: "weekSearch",
    getMany: "weekGetMany",
    findForRecipes: "weeksFindForRecipes",
  },
  recipeBooks: { search: "recipeBookSearch" },
  groceryTemplates: { search: "groceryTemplateSearch" },
  groceryItems: { search: "groceryItemSearch" },
  weekRecipes: { search: "weekRecipeSearch" },
  recipeRelations: { search: "recipeRelationSearch" },
  settings: { getFoodPlanning: "getFoodPlanningSettings" },
} as const;

function getCodeModeToolName({
  namespace,
  toolName,
}: {
  namespace: ReadOnlyToolNamespace["name"];
  toolName: string;
}): string {
  const names = CODE_MODE_TOOL_NAMES[namespace] as Record<string, string>;
  const codeModeToolName = names[toolName];
  if (!codeModeToolName) {
    throw new Error(
      `No Code Mode name configured for ${namespace}.${toolName}`,
    );
  }
  return codeModeToolName;
}

function createCodeModeTools(
  namespaces: ReadOnlyToolNamespace[],
): CodeModeTool[] {
  return namespaces.flatMap((namespace) =>
    namespace.tools.map((tool) => {
      if (
        !("__toolSide" in tool) ||
        tool.__toolSide !== "server" ||
        !tool.execute
      ) {
        throw new Error(
          `Code Mode requires a server tool for ${namespace.name}.${tool.name}`,
        );
      }
      return {
        ...tool,
        name: getCodeModeToolName({
          namespace: namespace.name,
          toolName: tool.name,
        }),
      } as CodeModeTool;
    }),
  );
}

function createBindingProvider(
  bindings: Record<string, ToolBinding>,
): ResolvedProvider {
  const functions: ResolvedProvider["fns"] = {};
  const preludeLines: string[] = [];

  for (const [name, binding] of Object.entries(bindings)) {
    if (!SAFE_IDENTIFIER.test(name)) {
      throw new Error(`Invalid Code Mode binding name: ${name}`);
    }
    functions[name] = async (input: unknown) => binding.execute(input);
    preludeLines.push(
      `const ${name} = (input) => ${BINDING_NAMESPACE}.${name}(input);`,
    );
  }

  return {
    name: BINDING_NAMESPACE,
    fns: functions,
    prelude: preludeLines.join("\n"),
  };
}

export function createDynamicWorkerIsolateDriver({
  executor,
}: {
  executor: Executor;
}): IsolateDriver {
  return {
    async createContext({ bindings }) {
      const provider = createBindingProvider(bindings);
      return {
        async execute<T = unknown>(code: string): Promise<ExecutionResult<T>> {
          const result = await executor.execute(`async () => {\n${code}\n}`, [
            provider,
          ]);
          if (result.error) {
            return {
              success: false,
              error: { name: "Error", message: result.error },
              ...(result.logs ? { logs: result.logs } : {}),
            };
          }
          return {
            success: true,
            value: result.result as T,
            ...(result.logs ? { logs: result.logs } : {}),
          };
        },
        async dispose() {},
      };
    },
  };
}

export function createAssistantCodeMode({
  executor,
  namespaces,
}: {
  executor: Executor;
  namespaces: ReadOnlyToolNamespace[];
}): CreateCodeModeResult {
  const codeMode = createCodeMode({
    driver: createDynamicWorkerIsolateDriver({ executor }),
    tools: createCodeModeTools(namespaces),
    timeout: 10_000,
    onSecretParameter: "throw",
  });
  const systemPrompt = codeMode.systemPrompt
    .replace(
      "For simple operations, prefer calling tools directly.",
      "Use execute_typescript for every retrieval operation, including a single lookup.",
    )
    .replace(
      /### Example[\s\S]*?### Important Notes/u,
      `### Example\n\n\`\`\`typescript\n${CHICKEN_RECIPE_SEARCH_EXAMPLE.trim()}\n\`\`\`\n\n### Important Notes`,
    );
  return { ...codeMode, systemPrompt };
}
