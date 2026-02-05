import type { LLMProvider, LLMCallParams, LLMResponse } from "./types.js";

/**
 * LLM Model - First-class model object with call/stream methods
 * Encapsulates provider implementation details
 */
export class LLMModel {
  readonly id: string;
  readonly name?: string;
  private readonly provider: LLMProvider;

  constructor(provider: LLMProvider) {
    if (!provider.model?.id) {
      throw new Error("Provider must have a model assigned");
    }
    this.id = provider.model.id;
    this.name = provider.model.name || provider.model.id;
    this.provider = provider;
  }

  /**
   * Call the model with given parameters
   */
  async call(params: LLMCallParams): Promise<LLMResponse> {
    return this.provider.call(params);
  }

  /**
   * Stream responses from the model
   */
  async *stream(params: LLMCallParams): AsyncIterable<string> {
    if (!this.provider.stream) {
      throw new Error(`Provider ${this.provider.name} does not support streaming`);
    }
    yield* this.provider.stream(params);
  }

  /**
   * Get the underlying provider name (for debugging/logging)
   */
  get providerName(): string {
    return this.provider.name;
  }
}
