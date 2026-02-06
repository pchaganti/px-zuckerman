/**
 * Tactical Planning - Step-by-step execution
 * Tracks task execution with step sequences and LLM-based decomposition
 */

import type { GoalTaskNode, TaskUrgency } from "./types.js";
import type { LLMMessage } from "@server/world/providers/llm/types.js";
import { LLMManager } from "@server/world/providers/llm/index.js";

/**
 * Task step
 */
export interface TaskStep {
  id: string;
  title: string;
  description?: string;
  order: number;
  completed: boolean;
  requiresConfirmation: boolean; // LLM decides if step needs user confirmation
  confirmationReason?: string; // Why confirmation is needed
  result?: unknown;
  error?: string;
}

/**
 * Task Executor
 */
export class TacticalExecutor {
  private currentTask: GoalTaskNode | null = null;
  private startTime: number | null = null;
  private steps: TaskStep[] = [];
  private llmManager: LLMManager;
  private readonly timeoutMs: number = 60 * 60 * 1000; // 1 hour default timeout

  constructor() {
    this.llmManager = LLMManager.getInstance();
  }

  /**
   * Start executing a task
   */
  startExecution(task: GoalTaskNode): void {
    if (task.type !== "task") {
      throw new Error("Can only execute tasks, not goals");
    }
    
    this.currentTask = task;
    this.startTime = Date.now();
    task.taskStatus = "active";
    task.progress = 0;
    task.updatedAt = Date.now();

    // Use steps from task metadata if available, otherwise create
    if (task.metadata?.steps && Array.isArray(task.metadata.steps)) {
      this.steps = task.metadata.steps as TaskStep[];
    } else {
      this.steps = this.createSteps(task);
    }
  }

  /**
   * Set steps for current task
   */
  setSteps(steps: TaskStep[]): void {
    this.steps = steps;
    if (this.currentTask) {
      this.currentTask.metadata = {
        ...this.currentTask.metadata,
        steps,
      };
    }
  }

  /**
   * Update task progress
   */
  updateProgress(task: GoalTaskNode, progress: number): void {
    if (task.id !== this.currentTask?.id || task.type !== "task") {
      return;
    }

    task.progress = Math.max(0, Math.min(100, progress));
    task.updatedAt = Date.now();
  }

  /**
   * Complete current step
   */
  completeCurrentStep(result?: unknown): boolean {
    if (!this.currentTask) {
      return false;
    }

    const currentStep = this.getCurrentStep();
    if (!currentStep) {
      return false;
    }

    this.completeStep(this.steps, currentStep.id, result);

    // Update task progress based on steps
    const progress = this.calculateProgress(this.steps);
    this.updateProgress(this.currentTask, progress);

    return true;
  }

  /**
   * Complete task execution
   */
  completeExecution(task: GoalTaskNode, result?: unknown): void {
    if (task.id !== this.currentTask?.id || task.type !== "task") {
      return;
    }

    task.taskStatus = "completed";
    task.progress = 100;
    task.result = result;
    task.updatedAt = Date.now();

    this.currentTask = null;
    this.startTime = null;
    this.steps = [];
  }

  /**
   * Fail task execution
   */
  failExecution(task: GoalTaskNode, error: string): void {
    if (task.id !== this.currentTask?.id || task.type !== "task") {
      return;
    }

    task.taskStatus = "failed";
    task.error = error;
    task.updatedAt = Date.now();

    this.currentTask = null;
    this.startTime = null;
    this.steps = [];
  }

  /**
   * Get current active task
   */
  getCurrentTask(): GoalTaskNode | null {
    return this.currentTask ? { ...this.currentTask } : null;
  }

  /**
   * Get current step
   */
  getCurrentStep(): TaskStep | null {
    return this.getCurrentStepFromSteps(this.steps);
  }

  /**
   * Get all steps
   */
  getSteps(): TaskStep[] {
    return [...this.steps];
  }

  /**
   * Check if all steps are completed
   */
  areAllStepsCompleted(): boolean {
    return this.areAllStepsCompletedCheck(this.steps);
  }

  /**
   * Get execution time for current task
   */
  getExecutionTime(): number | null {
    if (!this.startTime) {
      return null;
    }

    return Date.now() - this.startTime;
  }

  /**
   * Clear current task
   */
  clear(): void {
    this.currentTask = null;
    this.startTime = null;
    this.steps = [];
  }

  // ========== LLM Decomposition Methods (merged from TacticalAgent) ==========

  /**
   * Decompose task into steps using LLM
   */
  async decomposeWithLLM(
    message: string,
    urgency: TaskUrgency
  ): Promise<TaskStep[]> {
    const model = await this.llmManager.fastCheap();

    const systemPrompt = `You are responsible for tactical planning. Your role is to break down tasks into actionable steps.

Given a task, decide what steps are needed to complete it. Return your decision as JSON.

IMPORTANT: Each step must have a clear, descriptive title that explains what action will be performed. Do NOT use generic titles like "Step 1", "Step 2", or numbered steps. Use action verbs and be specific (e.g., "Create project directory", "Install npm dependencies", "Write configuration file").`;

    const context = `Urgency: ${urgency}\n\nTask: ${message}`;

    const messages: LLMMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: context },
    ];

    try {
      const response = await model.call({
        messages,
        temperature: 0.3,
        maxTokens: 500,
      });

      const content = response.content.trim();
      let jsonStr = content;
      const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (codeBlockMatch) {
        jsonStr = codeBlockMatch[1].trim();
      }
      
      const parsed = JSON.parse(jsonStr);

      if (parsed.stepsRequired === false || (Array.isArray(parsed.steps) && parsed.steps.length === 0)) {
        return [];
      }

      const stepsArray = parsed.steps || [];
      
      if (!Array.isArray(stepsArray)) {
        return this.createFallbackStep(message);
      }

      const steps: TaskStep[] = stepsArray.map((step: any, index: number) => {
        // Use title if provided, otherwise use description, otherwise use a descriptive fallback
        const title = step.title || step.description || `Complete task step ${index + 1}`;
        return {
          id: `step-${Date.now()}-${index}`,
          title: title,
          description: step.description,
          order: step.order ?? index,
          completed: false,
          requiresConfirmation: Boolean(step.requiresConfirmation),
          confirmationReason: step.confirmationReason,
        };
      });

      return steps.length > 0 ? steps : this.createFallbackStep(message);
    } catch (error) {
      console.warn(`[TacticalExecutor] Decomposition failed:`, error);
      return this.createFallbackStep(message);
    }
  }

  /**
   * Create fallback step if LLM fails
   */
  private createFallbackStep(message: string): TaskStep[] {
    return [
      {
        id: `step-${Date.now()}-0`,
        title: message,
        order: 0,
        completed: false,
        requiresConfirmation: false,
      },
    ];
  }

  // ========== Step Management Methods (merged from StepSequenceManager) ==========

  /**
   * Create steps from task description (fallback)
   */
  private createSteps(task: GoalTaskNode): TaskStep[] {
    const steps: TaskStep[] = [];

    if (task.description) {
      const stepTexts = task.description.split(/[→\n\-]/).filter((s) => s.trim());
      stepTexts.forEach((text, index) => {
        steps.push({
          id: `${task.id}-step-${index}`,
          title: text.trim(),
          order: index,
          completed: false,
          requiresConfirmation: false,
        });
      });
    }

    if (steps.length === 0) {
      steps.push({
        id: `${task.id}-step-0`,
        title: task.title,
        order: 0,
        completed: false,
        requiresConfirmation: false,
      });
    }

    return steps;
  }

  /**
   * Get current step from steps array
   */
  private getCurrentStepFromSteps(steps: TaskStep[]): TaskStep | null {
    return steps.find((s) => !s.completed) || null;
  }

  /**
   * Complete step
   */
  private completeStep(steps: TaskStep[], stepId: string, result?: unknown): boolean {
    const step = steps.find((s) => s.id === stepId);
    if (!step) {
      return false;
    }

    step.completed = true;
    step.result = result;
    return true;
  }

  /**
   * Calculate progress from steps
   */
  private calculateProgress(steps: TaskStep[]): number {
    if (steps.length === 0) {
      return 0;
    }

    const completed = steps.filter((s) => s.completed).length;
    return Math.round((completed / steps.length) * 100);
  }

  /**
   * Check if all steps completed
   */
  private areAllStepsCompletedCheck(steps: TaskStep[]): boolean {
    return steps.every((s) => s.completed);
  }
}
