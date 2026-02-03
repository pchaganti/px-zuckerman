import type { LLMMessage, LLMTool } from "../types.js";

export interface AnthropicRequest {
  model: string;
  max_tokens: number;
  messages: Array<{
    role: "user" | "assistant";
    content: string | Array<{
      type: "text" | "image" | "tool_use" | "tool_result";
      text?: string;
      source?: { type: "url" | "base64"; url?: string; media_type?: string; data?: string };
      id?: string;
      name?: string;
      input?: unknown;
      tool_use_id?: string;
    }>;
  }>;
  system?: Array<{ type: "text"; text: string }>;
  temperature?: number;
  top_p?: number;
  tools?: Array<{
    name: string;
    description?: string;
    input_schema: Record<string, unknown>;
  }>;
  tool_choice?: { type: "auto" | "any" | "tool"; name?: string };
  stop_sequences?: string[];
  stream?: boolean;
}

export interface AnthropicResponse {
  id: string;
  type: "message";
  role: "assistant";
  content: Array<{
    type: "text" | "tool_use";
    text?: string;
    id?: string;
    name?: string;
    input?: unknown;
  }>;
  model: string;
  stop_reason: "end_turn" | "max_tokens" | "stop_sequence" | "tool_use" | null;
  stop_sequence?: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number;
    cache_creation?: {
      ephemeral_5m_input_tokens?: number;
      ephemeral_1h_input_tokens?: number;
    };
  };
}

export interface AnthropicChunk {
  type: "message_start" | "content_block_start" | "content_block_delta" | "content_block_stop" | "message_delta" | "message_stop";
  index?: number;
  message?: AnthropicResponse;
  content_block?: {
    type: "text" | "tool_use";
    text?: string;
    id?: string;
    name?: string;
    input?: unknown;
  };
  delta?: {
    type: "text_delta" | "input_json_delta";
    text?: string;
    partial_json?: string;
    stop_reason?: string;
    stop_sequence?: string | null;
  };
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number;
  };
}

export function toAnthropicRequest(params: {
  messages: LLMMessage[];
  systemPrompt?: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  tools?: LLMTool[];
  stream?: boolean;
}): AnthropicRequest {
  const messages: AnthropicRequest["messages"] = [];
  const system: AnthropicRequest["system"] = [];

  if (params.systemPrompt) {
    system.push({ type: "text", text: params.systemPrompt });
  }

  for (const msg of params.messages) {
    if (msg.role === "system") {
      if (msg.content) {
        system.push({ type: "text", text: msg.content });
      }
      continue;
    }

    if (msg.role === "user") {
      messages.push({
        role: "user",
        content: msg.content,
      });
    } else if (msg.role === "assistant") {
      const content: Array<{ type: "text" | "tool_use"; text?: string; id?: string; name?: string; input?: unknown }> = [];
      
      if (msg.content) {
        content.push({ type: "text", text: msg.content });
      }

      if (msg.toolCalls && msg.toolCalls.length > 0) {
        for (const tc of msg.toolCalls) {
          let input: unknown;
          try {
            input = JSON.parse(tc.arguments);
          } catch {
            input = tc.arguments;
          }
          content.push({
            type: "tool_use",
            id: tc.id,
            name: tc.name,
            input,
          });
        }
      }

      if (content.length > 0) {
        messages.push({
          role: "assistant",
          content,
        });
      }
    } else if (msg.role === "tool") {
      // Anthropic uses tool_result in user messages
      messages.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: msg.toolCallId || "",
            text: msg.content,
          },
        ],
      });
    }
  }

  const tools = params.tools?.map((tool) => ({
    name: tool.function.name,
    description: tool.function.description,
    input_schema: tool.function.parameters || {},
  }));

  return {
    model: params.model,
    max_tokens: params.maxTokens ?? 100000, // Default to 8192 (Claude 3.5 Sonnet max output) - no limit when undefined
    messages,
    ...(system.length > 0 ? { system } : {}),
    temperature: params.temperature,
    tools,
    stream: params.stream,
  };
}

export function fromAnthropicResponse(response: AnthropicResponse): {
  content: string;
  toolCalls?: Array<{ id: string; name: string; arguments: string }>;
  finishReason?: string;
  tokensUsed?: { input: number; output: number; total: number };
  model: string;
} {
  const textParts: string[] = [];
  const toolCalls: Array<{ id: string; name: string; arguments: string }> = [];

  for (const block of response.content) {
    if (block.type === "text" && block.text) {
      textParts.push(block.text);
    } else if (block.type === "tool_use" && block.id && block.name) {
      const input = typeof block.input === "string" ? block.input : JSON.stringify(block.input || {});
      toolCalls.push({
        id: block.id,
        name: block.name,
        arguments: input,
      });
    }
  }

  const finishReason = response.stop_reason === "end_turn" ? "stop" : 
                       response.stop_reason === "tool_use" ? "tool_calls" :
                       response.stop_reason === "max_tokens" ? "length" :
                       response.stop_reason || undefined;

  return {
    content: textParts.join(""),
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    finishReason,
    tokensUsed: {
      input: response.usage.input_tokens,
      output: response.usage.output_tokens,
      total: response.usage.input_tokens + response.usage.output_tokens,
    },
    model: response.model,
  };
}

export function parseAnthropicStreamChunk(chunk: string): AnthropicChunk | null {
  const lines = chunk.split("\n");
  const dataLine = lines.find((l) => l.startsWith("data: "));
  if (!dataLine) return null;

  try {
    const json = JSON.parse(dataLine.slice(6));
    return json as AnthropicChunk;
  } catch {
    return null;
  }
}
