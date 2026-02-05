/**
 * Alerting System - Urgency Detection
 * Detects urgency levels in incoming messages
 */

import type { LLMMessage } from "@server/world/providers/llm/types.js";
import type { AlertingAnalysis, UrgencyLevel } from "../types.js";
import { LLMManager } from "@server/world/providers/llm/index.js";

/**
 * Detect urgency level in message
 */
export async function detectUrgency(
  message: string
): Promise<AlertingAnalysis> {
  // Select model for urgency detection (fast for efficiency)
  const llmManager = LLMManager.getInstance();
  const model = await llmManager.fast();
  const systemPrompt = `You are the alerting system of attention. Analyze the message and determine urgency level.

Urgency levels:
- critical: Immediate action needed, time-sensitive, urgent requests, emergencies
- high: Important queries, complex tasks, needs detailed context, significant requests
- medium: Normal questions, standard requests, typical interactions
- low: Casual chat, greetings, simple acknowledgments, non-urgent

Return JSON:
{
  "urgency": "low" | "medium" | "high" | "critical",
  "reasoning": "brief explanation"
}

Return ONLY valid JSON, no other text.`;

  const messages: LLMMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: message },
  ];

  try {
    const response = await model.call({
      messages,
      temperature: 0.3,
      maxTokens: 150,
    });

    const content = response.content.trim();
    const jsonMatch = content.match(/```(?:json)?\s*(\{.*?\})\s*```/s);
    const jsonStr = jsonMatch ? jsonMatch[1] : content;
    const parsed = JSON.parse(jsonStr);

    const urgency = validateUrgency(parsed.urgency) || "medium";

    return {
      urgency,
      reasoning: parsed.reasoning,
    };
  } catch (error) {
    console.warn(`[Alerting] Urgency detection failed:`, error);
    return {
      urgency: "medium",
      reasoning: "Analysis failed, using default",
    };
  }
}

function validateUrgency(urgency: unknown): UrgencyLevel | null {
  const valid: UrgencyLevel[] = ["low", "medium", "high", "critical"];
  return valid.includes(urgency as UrgencyLevel) ? (urgency as UrgencyLevel) : null;
}
