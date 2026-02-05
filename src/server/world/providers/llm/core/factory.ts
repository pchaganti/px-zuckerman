import type { LLMProvider, LLMModel } from "../types.js";
import { AnthropicProvider } from "../api/anthropic.js";
import { OpenAIProvider } from "../api/openai.js";
import { OpenRouterProvider } from "../api/openrouter.js";
import { MockLLMProvider } from "../api/mock.js";
import { LLMProviderRegistry } from "./registry.js";

/**
 * Factory for creating LLM provider instances
 */
export class LLMProviderFactory {
  /**
   * Create a provider instance by name with model
   */
  create(name: string, apiKey: string, model: LLMModel, options?: Record<string, unknown>): LLMProvider {
    switch (name) {
      case "anthropic":
        return new AnthropicProvider(apiKey, model);
      case "openai":
        return new OpenAIProvider(apiKey, model, options as { baseUrl?: string; customHeaders?: () => HeadersInit });
      case "openrouter":
        return new OpenRouterProvider(apiKey, model);
      case "mock":
        return new MockLLMProvider();
      default:
        throw new Error(`Unknown provider: ${name}`);
    }
  }


  /**
   * Create and register default providers based on environment variables
   */
  createDefaultProviders(useMock = false): LLMProviderRegistry {
    const registry = new LLMProviderRegistry();

    // Use mock provider in test environment or if explicitly requested
    if (useMock || process.env.NODE_ENV === "test" || !!process.env.VITEST) {
      registry.register(new MockLLMProvider());
      return registry;
    }

    // Register Anthropic if API key is available
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (anthropicKey) {
      try {
        // Use default model - will be overridden when selecting by trait
        registry.register(new AnthropicProvider(anthropicKey, { id: "claude-sonnet-4-5" }));
      } catch (err) {
        console.warn("Failed to register Anthropic provider:", err);
      }
    }

    // Register OpenAI if API key is available
    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey) {
      try {
        // Use default model - will be overridden when selecting by trait
        registry.register(new OpenAIProvider(openaiKey, { id: "gpt-5.2" }));
      } catch (err) {
        console.warn("Failed to register OpenAI provider:", err);
      }
    }

    // Register OpenRouter if API key is available
    const openrouterKey = process.env.OPENROUTER_API_KEY;
    if (openrouterKey) {
      try {
        // Use default model - will be overridden when selecting by trait
        registry.register(new OpenRouterProvider(openrouterKey, { id: "openai/gpt-5.2" }));
      } catch (err) {
        console.warn("Failed to register OpenRouter provider:", err);
      }
    }

    return registry;
  }
}
