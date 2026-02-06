/**
 * Reactive Planning - Task switching
 * Handles task switching logic with LLM-based continuity assessment
 */

import type { GoalTaskNode } from "./types.js";
import type { LLMMessage } from "@server/world/providers/llm/types.js";
import { LLMManager } from "@server/world/providers/llm/index.js";

/**
 * Task context for resumption
 */
export interface TaskContext {
  taskId: string;
  savedAt: number;
  context: Record<string, unknown>;
}

/**
 * Switching decision from LLM
 */
export interface SwitchingDecision {
  shouldSwitch: boolean;
  reasoning: string;
  continuityStrength?: number;
}

/**
 * Task Switcher
 */
export class TaskSwitcher {
  private savedContexts: Map<string, TaskContext> = new Map();
  private switchHistory: Array<{ from: string; to: string; timestamp: number }> = [];
  private llmManager: LLMManager;

  constructor() {
    this.llmManager = LLMManager.getInstance();
  }

  /**
   * Determine if should switch from current task to new task (LLM-based)
   */
  async shouldSwitchWithLLM(
    currentTask: GoalTaskNode | null,
    newTask: GoalTaskNode,
    currentFocus: null
  ): Promise<SwitchingDecision> {
    if (!currentTask) {
      return {
        shouldSwitch: true,
        reasoning: "No current task, can start new task",
      };
    }

    if (currentTask.id === newTask.id) {
      return {
        shouldSwitch: false,
        reasoning: "Same task, continue execution",
      };
    }

    try {
      const model = await this.llmManager.fast();

      const systemPrompt = `You are responsible for task switching decisions. Your role is to decide when to switch from one task to another.

Given the current task and a new task, decide if we should switch. Return your decision as JSON.`;

      const context = `Current Task:
- Title: ${currentTask.title}
- Urgency: ${currentTask.type === "task" ? (currentTask.urgency || "medium") : "N/A"}
- Progress: ${currentTask.progress || 0}%
- Type: ${currentTask.type}

New Task:
- Title: ${newTask.title}
- Urgency: ${newTask.type === "task" ? (newTask.urgency || "medium") : "N/A"}
- Type: ${newTask.type}
- Description: ${newTask.description || "none"}`;

      const messages: LLMMessage[] = [
        { role: "system", content: systemPrompt },
        { role: "user", content: context },
      ];

      const response = await model.call({
        messages,
        temperature: 0.3,
        maxTokens: 300,
      });

      const content = response.content.trim();
      const jsonMatch = content.match(/```(?:json)?\s*(\{.*?\})\s*```/s);
      const jsonStr = jsonMatch ? jsonMatch[1] : content;
      const parsed = JSON.parse(jsonStr);

      return {
        shouldSwitch: Boolean(parsed.shouldSwitch),
        reasoning: parsed.reasoning || "LLM decision",
        continuityStrength: parsed.continuityStrength !== undefined 
          ? Math.max(0, Math.min(1, parsed.continuityStrength))
          : undefined,
      };
    } catch (error) {
      console.warn(`[TaskSwitcher] Decision failed:`, error);
      return {
        shouldSwitch: true,
        reasoning: "LLM decision failed, defaulting to switch",
      };
    }
  }

  /**
   * Get switch history
   */
  getSwitchHistory(): Array<{ from: string; to: string; timestamp: number }> {
    return [...this.switchHistory];
  }

  /**
   * Save task context for resumption
   */
  saveTaskContext(taskId: string, context: Record<string, unknown>): void {
    this.savedContexts.set(taskId, {
      taskId,
      savedAt: Date.now(),
      context,
    });
  }

  /**
   * Clear saved context for task
   */
  clearContext(taskId: string): void {
    this.savedContexts.delete(taskId);
  }
}
