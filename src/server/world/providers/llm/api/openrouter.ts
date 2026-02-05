import type { LLMProvider, LLMCallParams, LLMResponse, LLMModel } from "../types.js";
import { OpenAIProvider } from "./openai.js";

/**
 * OpenRouter provider - uses OpenAI provider with OpenRouter API endpoint
 * OpenRouter uses OpenAI-compatible API, so we reuse OpenAI implementation
 */
export class OpenRouterProvider implements LLMProvider {
  name = "openrouter";
  model: LLMModel;
  private openaiProvider: OpenAIProvider;

  constructor(apiKey: string, model: LLMModel) {
    if (!apiKey) {
      throw new Error("OpenRouter API key is required");
    }
    if (!model?.id) {
      throw new Error("Model is required");
    }
    this.model = model;
    // Create OpenAI provider with OpenRouter's endpoint and custom headers
    this.openaiProvider = new OpenAIProvider(apiKey, model, {
      baseUrl: "https://openrouter.ai/api/v1",
      customHeaders: () => ({
        "HTTP-Referer": process.env.OPENROUTER_HTTP_REFERER || "https://github.com/zuckerman",
        "X-Title": process.env.OPENROUTER_X_TITLE || "Zuckerman",
      }),
    });
  }

  async call(params: LLMCallParams): Promise<LLMResponse> {
    return this.openaiProvider.call(params);
  }

  async *stream(params: LLMCallParams): AsyncIterable<string> {
    yield* this.openaiProvider.stream(params);
  }
}
