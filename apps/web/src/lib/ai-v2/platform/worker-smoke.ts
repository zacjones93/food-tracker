import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

import { createAssistantPlatformFromBindings } from "./core";

const platformStatusTool = toolDefinition({
  name: "status",
  description: "Report whether the isolated assistant platform seam is available",
  inputSchema: z.object({}),
  outputSchema: z.object({ available: z.literal(true) }),
}).server(async () => ({ available: true as const }));

export default {
  fetch(_request, env) {
    const platform = createAssistantPlatformFromBindings({
      bindings: {
        ai: env.AI,
        loader: env.LOADER,
      },
      readOnlyToolNamespaces: [{ name: "platform", tools: [platformStatusTool] }],
    });

    return Response.json({
      modelAdapter: platform.modelAdapter.name,
      codeModeTool: platform.tools[0].name,
      outboundAccess: "disabled",
      mutationTools: 0,
    });
  },
} satisfies ExportedHandler<Pick<CloudflareEnv, "AI" | "LOADER">>;
