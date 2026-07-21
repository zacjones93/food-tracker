import type { Tool } from "@tanstack/ai";

const JAVASCRIPT_IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

export interface ReadOnlyToolNamespace {
  name: string;
  tools: Tool[];
}

interface ValidateReadOnlyToolNamespacesOptions {
  namespaces: ReadOnlyToolNamespace[];
}

export function validateReadOnlyToolNamespaces({
  namespaces,
}: ValidateReadOnlyToolNamespacesOptions): void {
  if (namespaces.length === 0) {
    throw new Error("Code Mode requires at least one read-only tool namespace");
  }

  const namespaceNames = new Set<string>();

  for (const namespace of namespaces) {
    if (!JAVASCRIPT_IDENTIFIER.test(namespace.name)) {
      throw new Error(`Invalid Code Mode namespace: ${namespace.name}`);
    }

    if (namespaceNames.has(namespace.name)) {
      throw new Error(`Duplicate Code Mode namespace: ${namespace.name}`);
    }
    namespaceNames.add(namespace.name);

    if (namespace.tools.length === 0) {
      throw new Error(`Code Mode namespace ${namespace.name} has no tools`);
    }

    const toolNames = new Set<string>();
    for (const tool of namespace.tools) {
      if (!JAVASCRIPT_IDENTIFIER.test(tool.name)) {
        throw new Error(`Invalid Code Mode tool name: ${namespace.name}.${tool.name}`);
      }

      if (!tool.execute) {
        throw new Error(`Code Mode tool ${namespace.name}.${tool.name} has no server implementation`);
      }

      if (tool.needsApproval === true || typeof tool.needsApproval === "function") {
        throw new Error(
          `Approval-required tool ${namespace.name}.${tool.name} cannot run in stateless Code Mode`,
        );
      }

      if (toolNames.has(tool.name)) {
        throw new Error(`Duplicate Code Mode tool: ${namespace.name}.${tool.name}`);
      }
      toolNames.add(tool.name);
    }
  }
}
