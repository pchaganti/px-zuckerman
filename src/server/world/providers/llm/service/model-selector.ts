import type { LLMProvider, LLMModel } from "../types.js";
import type { ZuckermanConfig } from "@server/world/config/types.js";

/**
 * Extract model object from config value
 */
function extractModel(model: any): LLMModel | undefined {
  if (!model) return undefined;
  if (typeof model === "object" && model.id && typeof model.id === "string") {
    return { id: model.id, name: model.name };
  }
  return undefined;
}

/**
 * Select the appropriate model based on provider and configuration
 */
export function selectModel(
  provider: LLMProvider,
  config: ZuckermanConfig,
  override?: LLMModel,
): LLMModel {
  if (override) {
    return override;
  }

  if (config.agents?.defaults?.defaultModel) {
    const model = extractModel(config.agents.defaults.defaultModel);
    if (model) return model;
  }

  // Provider-specific defaults
  if (provider.name === "anthropic") {
    const model = extractModel(config.llm?.anthropic?.defaultModel);
    if (model) return model;
    return { id: "claude-3-5-sonnet-20241022" };
  }

  if (provider.name === "openai") {
    const model = extractModel(config.llm?.openai?.defaultModel);
    if (model) return model;
    return { id: "gpt-4o" };
  }

  if (provider.name === "openrouter") {
    const model = extractModel(config.llm?.openrouter?.defaultModel);
    if (model) return model;
    return { id: "deepseek/deepseek-chat" };
  }

  // Fallback
  return { id: "gpt-4o" };
}
