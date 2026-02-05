/**
 * Selective Attention - Filter
 * Filters relevant vs irrelevant information
 */

import type { FocusState } from "../types.js";

/**
 * Filter criteria based on focus state
 */
export interface FilterCriteria {
  topic?: string;
  task?: string;
  minRelevance?: number;
}

/**
 * Create filter criteria from focus state
 */
export function createFilterCriteria(focus: FocusState | null): FilterCriteria {
  if (!focus) {
    return {
      minRelevance: 0.3, // Low threshold if no focus
    };
  }

  return {
    topic: focus.currentTopic,
    task: focus.currentTask,
    minRelevance: getMinRelevance(focus.urgency),
  };
}

/**
 * Get minimum relevance threshold based on urgency
 */
function getMinRelevance(urgency: FocusState["urgency"]): number {
  const mapping: Record<FocusState["urgency"], number> = {
    low: 0.3,
    medium: 0.4,
    high: 0.5,
    critical: 0.6,
  };
  return mapping[urgency];
}
