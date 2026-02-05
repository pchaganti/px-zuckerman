/**
 * Orienting System - Attention Analyzer
 * Determines what to attend to in incoming messages
 */

import type { LLMMessage } from "@server/world/providers/llm/types.js";
import type { OrientingAnalysis, FocusLevel } from "../types.js";
import { LLMManager } from "@server/world/providers/llm/index.js";

/**
 * Analyze message to determine what to attend to
 */
export async function analyzeOrienting(
  message: string,
  previousFocus?: { topic: string; task?: string }
): Promise<OrientingAnalysis> {
  // Select model for orienting analysis (fast for efficiency)
  const llmManager = LLMManager.getInstance();
  const model = await llmManager.fast();
  const systemPrompt = `You are the orienting system of attention. Analyze the message to determine what to attend to.

Determine:
1. Main topic/focus (2-5 words)
2. Active task/goal (if any)
3. Focus level: narrow (specific, focused) or broad (exploratory, general)
4. Is this continuing previous focus or a new topic?

Return JSON:
{
  "topic": "main topic in 2-5 words",
  "task": "active task/goal if any, otherwise omit",
  "focusLevel": "narrow" | "broad",
  "isContinuation": true/false,
  "previousTopic": "what was focused on before (if continuation)"
}

Focus level:
- narrow: Specific question, focused task, single topic, concrete goal
- broad: Multiple topics, exploratory, general discussion, open-ended

Return ONLY valid JSON, no other text.`;

  const context = previousFocus
    ? `Previous focus: ${previousFocus.topic}${previousFocus.task ? ` (task: ${previousFocus.task})` : ""}`
    : "";

  const messages: LLMMessage[] = [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: context
        ? `${context}\n\nCurrent message: ${message}`
        : message,
    },
  ];

  try {
    const response = await model.call({
      messages,
      temperature: 0.3,
      maxTokens: 200,
    });

    const content = response.content.trim();
    const jsonMatch = content.match(/```(?:json)?\s*(\{.*?\})\s*```/s);
    const jsonStr = jsonMatch ? jsonMatch[1] : content;
    const parsed = JSON.parse(jsonStr);

    return {
      topic: parsed.topic || "general",
      task: parsed.task,
      focusLevel: parsed.focusLevel === "narrow" ? "narrow" : "broad",
      isContinuation: Boolean(parsed.isContinuation),
      previousTopic: parsed.previousTopic,
    };
  } catch (error) {
    console.warn(`[Orienting] Analysis failed:`, error);
    return {
      topic: "general",
      focusLevel: "broad",
      isContinuation: false,
    };
  }
}
