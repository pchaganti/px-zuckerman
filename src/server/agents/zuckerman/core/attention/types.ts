/**
 * Attention System Types
 * Brain-inspired attention system types
 */

/**
 * Urgency level for alerting system
 */
export type UrgencyLevel = "low" | "medium" | "high" | "critical";

/**
 * Focus level - how narrow/broad the attention
 */
export type FocusLevel = "narrow" | "broad";

/**
 * Focus state (from sustained attention)
 */
export interface FocusState {
  agentId: string;
  currentTopic: string;
  currentTask?: string;
  urgency: UrgencyLevel;
  focusLevel: FocusLevel;
  lastUpdated: number;
  turnCount: number;
  lastConversationId?: string;
}

/**
 * Orienting analysis - what to attend to
 */
export interface OrientingAnalysis {
  topic: string;                    // Main topic/focus
  task?: string;                   // Active task/goal (if any)
  focusLevel: FocusLevel;          // Narrow (specific) vs broad (exploratory)
  isContinuation: boolean;         // Continues previous focus?
  previousTopic?: string;          // What was focused on before
}

/**
 * Alerting analysis - urgency detection
 */
export interface AlertingAnalysis {
  urgency: UrgencyLevel;
  reasoning?: string;              // Why this urgency level
}

/**
 * Selective attention - relevance scoring
 */
export interface RelevanceScore {
  score: number;                    // 0-1 relevance score
  reason?: string;                 // Why this relevance
}

/**
 * Executive attention - overall attention state
 */
export interface AttentionState {
  agentId: string;
  orienting: OrientingAnalysis;
  alerting: AlertingAnalysis;
  focus: FocusState | null;
  timestamp: number;
}

/**
 * Attention manager configuration
 */
export interface AttentionConfig {
  enabled?: boolean;
  focusPersistence?: boolean;
  defaultUrgency?: UrgencyLevel;
}
