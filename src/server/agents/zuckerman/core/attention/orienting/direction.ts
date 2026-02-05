/**
 * Orienting System - Attention Direction
 * Directs attention to specific topics/tasks
 */

import type { OrientingAnalysis } from "../types.js";

/**
 * Determine attention direction from analysis
 */
export function getAttentionDirection(analysis: OrientingAnalysis): {
  primary: string;
  secondary?: string;
} {
  if (analysis.task) {
    return {
      primary: analysis.task,
      secondary: analysis.topic,
    };
  }
  return {
    primary: analysis.topic,
  };
}

/**
 * Check if attention should shift
 */
export function shouldShiftAttention(
  current: OrientingAnalysis,
  previous?: OrientingAnalysis
): boolean {
  if (!previous) return true;
  if (!current.isContinuation) return true;
  if (current.topic !== previous.topic) return true;
  return false;
}
