import type { LLMProvider, LLMModel as LLMModelType } from "./types.js";
import type { ZuckermanConfig, ModelTrait } from "@server/world/config/types.js";
import { loadConfig } from "@server/world/config/index.js";
import { LLMProviderRegistry } from "./core/registry.js";
import { LLMProviderFactory } from "./core/factory.js";
import { LLMModel } from "./model.js";

/**
 * Main LLM Manager - unified entry point for LLM provider and model selection
 * Implements singleton pattern for global access
 */
export class LLMManager {
  private static instance: LLMManager | null = null;
  
  private providerRegistry: LLMProviderRegistry;
  private factory: LLMProviderFactory;
  private selectedProvider: LLMProvider | null = null;

  private constructor(providerRegistry?: LLMProviderRegistry, factory?: LLMProviderFactory) {
    this.factory = factory || new LLMProviderFactory();
    this.providerRegistry = providerRegistry || this.factory.createDefaultProviders(
      process.env.NODE_ENV === "test" || !!process.env.VITEST
    );
  }

  /**
   * Get singleton instance
   */
  static getInstance(providerRegistry?: LLMProviderRegistry, factory?: LLMProviderFactory): LLMManager {
    if (!LLMManager.instance) {
      LLMManager.instance = new LLMManager(providerRegistry, factory);
    }
    return LLMManager.instance;
  }

  /**
   * Reset singleton instance (useful for testing)
   */
  static resetInstance(): void {
    LLMManager.instance = null;
  }

  /**
   * Select provider based on configuration
   */
  private async selectProvider(config: ZuckermanConfig, providerOverride?: string): Promise<LLMProvider> {
    if (this.selectedProvider) {
      return this.selectedProvider;
    }

    // Check environment variables first, then config
    const anthropicKey = process.env.ANTHROPIC_API_KEY || config.llm?.anthropic?.apiKey;
    const openaiKey = process.env.OPENAI_API_KEY || config.llm?.openai?.apiKey;
    const openrouterKey = process.env.OPENROUTER_API_KEY || config.llm?.openrouter?.apiKey;

    // Determine provider: use override, config default, or auto-detect from available keys
    const providerName = providerOverride ||
      config.agents?.defaults?.defaultProvider || 
      (openrouterKey ? "openrouter" :
       anthropicKey ? "anthropic" :
       openaiKey ? "openai" : null);

    let provider: LLMProvider | undefined;

    // Try to get from registry first
    if (providerName === "anthropic" && anthropicKey) {
      provider = this.providerRegistry.get("anthropic");
      if (!provider && anthropicKey) {
        const defaultModel = config.llm?.anthropic?.defaultModel || "claude-sonnet-4-5";
        provider = this.factory.create("anthropic", anthropicKey, { id: defaultModel });
        this.providerRegistry.register(provider);
      }
    } else if (providerName === "openai" && openaiKey) {
      provider = this.providerRegistry.get("openai");
      if (!provider && openaiKey) {
        const defaultModel = config.llm?.openai?.defaultModel || "gpt-5.2";
        provider = this.factory.create("openai", openaiKey, { id: defaultModel });
        this.providerRegistry.register(provider);
      }
    } else if (providerName === "openrouter" && openrouterKey) {
      provider = this.providerRegistry.get("openrouter");
      if (!provider && openrouterKey) {
        const defaultModel = config.llm?.openrouter?.defaultModel || "openai/gpt-5.2";
        provider = this.factory.create("openrouter", openrouterKey, { id: defaultModel });
        this.providerRegistry.register(provider);
      }
    }

    // Fallback: try any available provider in priority order (including mock in tests)
    if (!provider) {
      provider =
        this.providerRegistry.get("openrouter") ||
        this.providerRegistry.get("anthropic") ||
        this.providerRegistry.get("openai") ||
        this.providerRegistry.get("mock");
    }

    if (!provider) {
      const availableKeys = [
        openrouterKey && "OPENROUTER_API_KEY",
        anthropicKey && "ANTHROPIC_API_KEY",
        openaiKey && "OPENAI_API_KEY",
      ].filter(Boolean);
      
      throw new Error(
        `No LLM provider available. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or OPENROUTER_API_KEY environment variable, or configure in .zuckerman/config.json.${availableKeys.length > 0 ? ` Found keys: ${availableKeys.join(", ")}` : ""}`,
      );
    }

    this.selectedProvider = provider;
    return provider;
  }

  /**
   * Select model by trait from config
   */
  private selectModelByTrait(
    provider: LLMProvider,
    trait: ModelTrait,
    config: ZuckermanConfig
  ): LLMModelType {
    const llmConfig = config.llm;
    if (!llmConfig) {
      throw new Error(`LLM config not found. Please configure LLM settings in config file.`);
    }

    // Type-safe access based on provider name
    let configTraits: Record<ModelTrait, string> | undefined;
    if (provider.name === "anthropic") {
      configTraits = llmConfig.anthropic?.traits;
    } else if (provider.name === "openai") {
      configTraits = llmConfig.openai?.traits;
    } else if (provider.name === "openrouter") {
      configTraits = llmConfig.openrouter?.traits;
    }
    
    if (configTraits && configTraits[trait]) {
      return { id: configTraits[trait] };
    }

    throw new Error(
      `No trait mapping found for provider "${provider.name}" and trait "${trait}". Please configure trait mappings in config file.`
    );
  }

  /**
   * Select model by trait and return LLMModel instance
   */
  private async selectByTrait(
    trait: ModelTrait,
    config?: ZuckermanConfig,
    providerOverride?: string
  ): Promise<LLMModel> {
    const resolvedConfig = config || await loadConfig();
    const provider = await this.selectProvider(resolvedConfig, providerOverride);
    const modelConfig = this.selectModelByTrait(provider, trait, resolvedConfig);
    
    // Get API key for creating new provider instance
    let apiKey = "";
    if (provider.name === "anthropic") {
      apiKey = process.env.ANTHROPIC_API_KEY || resolvedConfig.llm?.anthropic?.apiKey || "";
    } else if (provider.name === "openai") {
      apiKey = process.env.OPENAI_API_KEY || resolvedConfig.llm?.openai?.apiKey || "";
    } else if (provider.name === "openrouter") {
      apiKey = process.env.OPENROUTER_API_KEY || resolvedConfig.llm?.openrouter?.apiKey || "";
    }
    
    if (!apiKey && provider.name !== "mock") {
      throw new Error(`API key required for provider ${provider.name}`);
    }
    
    // Extract options for OpenRouter
    let options: Record<string, unknown> | undefined;
    if (provider.name === "openrouter") {
      options = {
        baseUrl: "https://openrouter.ai/api/v1",
        customHeaders: () => ({
          "HTTP-Referer": process.env.OPENROUTER_HTTP_REFERER || "https://github.com/zuckerman",
          "X-Title": process.env.OPENROUTER_X_TITLE || "Zuckerman",
        }),
      };
    }
    
    // Create provider with selected model
    const providerWithModel = this.factory.create(provider.name, apiKey, modelConfig, options);
    
    return new LLMModel(providerWithModel);
  }

  /**
   * Get fast and cheap model
   */
  async fastCheap(config?: ZuckermanConfig, providerOverride?: string): Promise<LLMModel> {
    return this.selectByTrait("fastCheap", config, providerOverride);
  }

  /**
   * Get cheap model
   */
  async cheap(config?: ZuckermanConfig, providerOverride?: string): Promise<LLMModel> {
    return this.selectByTrait("cheap", config, providerOverride);
  }

  /**
   * Get fast model
   */
  async fast(config?: ZuckermanConfig, providerOverride?: string): Promise<LLMModel> {
    return this.selectByTrait("fast", config, providerOverride);
  }

  /**
   * Get high quality model
   */
  async highQuality(config?: ZuckermanConfig, providerOverride?: string): Promise<LLMModel> {
    return this.selectByTrait("highQuality", config, providerOverride);
  }

  /**
   * Get large context model
   */
  async largeContext(config?: ZuckermanConfig, providerOverride?: string): Promise<LLMModel> {
    return this.selectByTrait("largeContext", config, providerOverride);
  }

  /**
   * Clear provider cache
   */
  clearCache(): void {
    this.selectedProvider = null;
  }
}
