import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";

import {
  createAssistantPlatformFromBindings,
  type AssistantPlatformBindings,
  type CreateAssistantPlatformOptions,
} from "./core";

export function getAssistantPlatformBindings(): AssistantPlatformBindings {
  const { env } = getCloudflareContext();

  return {
    ai: env.AI,
    loader: env.LOADER,
  };
}

export function createAssistantPlatform(options: CreateAssistantPlatformOptions) {
  return createAssistantPlatformFromBindings({
    bindings: getAssistantPlatformBindings(),
    ...options,
  });
}

export type {
  AssistantPlatformBindings,
  CreateAssistantPlatformOptions,
  CreateAssistantPlatformFromBindingsOptions,
} from "./core";
export type { ReadOnlyToolNamespace } from "./read-only-tools";
