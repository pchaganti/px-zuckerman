import type { LLMProvider } from "../types.js";

/**
 * Registry for managing LLM provider instances
 */
export class LLMProviderRegistry {
  private providers = new Map<string, LLMProvider>();

  register(provider: LLMProvider): void {
    this.providers.set(provider.name, provider);
  }

  get(name: string): LLMProvider | undefined {
    return this.providers.get(name);
  }

  list(): LLMProvider[] {
    return Array.from(this.providers.values());
  }

  has(name: string): boolean {
    return this.providers.has(name);
  }

  clear(): void {
    this.providers.clear();
  }
}
