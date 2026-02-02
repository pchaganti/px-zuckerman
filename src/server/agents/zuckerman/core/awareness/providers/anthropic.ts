import type { LLMProvider, LLMCallParams, LLMResponse } from "./types.js";
import {
  toAnthropicRequest,
  fromAnthropicResponse,
  parseAnthropicStreamChunk,
  type AnthropicRequest,
} from "./helpers/anthropic-helpers.js";

/**
 * Anthropic provider using direct HTTP requests
 * Based on OpenCode's implementation approach
 */
export class AnthropicProvider implements LLMProvider {
  name = "anthropic";
  private apiKey: string;
  private baseUrl = "https://api.anthropic.com/v1";

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error("Anthropic API key is required");
    }
    this.apiKey = apiKey;
  }

  async call(params: LLMCallParams): Promise<LLMResponse> {
    const {
      messages,
      systemPrompt,
      temperature = 1.0,
      maxTokens = 4096,
      model = { id: "claude-3-5-sonnet-20241022" },
      tools,
    } = params;

    const requestBody = toAnthropicRequest({
      messages,
      systemPrompt,
      model: model.id,
      temperature,
      maxTokens,
      tools,
      stream: false,
    });

    try {
      const headers: HeadersInit = {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      };

      // Add beta header for sonnet models with extended context
      if (model.id.startsWith("claude-sonnet-")) {
        headers["anthropic-beta"] = "context-1m-2025-08-07";
      }

      const response = await fetch(`${this.baseUrl}/messages`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          ...requestBody,
          service_tier: "standard_only",
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `HTTP ${response.status}: ${errorText}`;
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error?.message || errorMessage;
        } catch {
          // Use text as-is
        }
        throw new Error(`Anthropic API error: ${errorMessage}`);
      }

      const data = await response.json();
      const result = fromAnthropicResponse(data);

      return {
        content: result.content,
        tokensUsed: result.tokensUsed,
        model: result.model,
        finishReason: result.finishReason,
        toolCalls: result.toolCalls,
      };
    } catch (error) {
      throw new Error(
        `Anthropic API error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async *stream(params: LLMCallParams): AsyncIterable<string> {
    const {
      messages,
      systemPrompt,
      temperature = 1.0,
      maxTokens = 4096,
      model = { id: "claude-3-5-sonnet-20241022" },
      tools,
    } = params;

    const requestBody = toAnthropicRequest({
      messages,
      systemPrompt,
      model: model.id,
      temperature,
      maxTokens,
      tools,
      stream: true,
    });

    try {
      const headers: HeadersInit = {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      };

      // Add beta header for sonnet models with extended context
      if (model.id.startsWith("claude-sonnet-")) {
        headers["anthropic-beta"] = "context-1m-2025-08-07";
      }

      const response = await fetch(`${this.baseUrl}/messages`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          ...requestBody,
          service_tier: "standard_only",
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `HTTP ${response.status}: ${errorText}`;
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error?.message || errorMessage;
        } catch {
          // Use text as-is
        }
        throw new Error(`Anthropic API error: ${errorMessage}`);
      }

      if (!response.body) {
        throw new Error("No response body for streaming");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const chunk = parseAnthropicStreamChunk(line);
            if (chunk) {
              if (chunk.type === "content_block_delta" && chunk.delta?.type === "text_delta" && chunk.delta.text) {
                yield chunk.delta.text;
              }
            }
          }
        }

        // Process remaining buffer
        if (buffer) {
          const chunk = parseAnthropicStreamChunk(buffer);
          if (chunk && chunk.type === "content_block_delta" && chunk.delta?.type === "text_delta" && chunk.delta.text) {
            yield chunk.delta.text;
          }
        }
      } finally {
        reader.releaseLock();
      }
    } catch (error) {
      throw new Error(
        `Anthropic API error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
