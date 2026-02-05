/**
 * Sustained Attention - Continuity
 * Maintains focus continuity across turns
 */

import type { FocusState } from "../types.js";

/**
 * Check if focus is being maintained
 */
export function isFocusMaintained(
  current: FocusState,
  previous: FocusState | null
): boolean {
  if (!previous) return false;
  if (current.currentTopic !== previous.currentTopic) return false;
  if (current.currentTask !== previous.currentTask) return false;
  
  // Check if too much time has passed (e.g., > 1 hour)
  const timeDiff = current.lastUpdated - previous.lastUpdated;
  const oneHour = 60 * 60 * 1000;
  if (timeDiff > oneHour) return false;

  return true;
}

/**
 * Calculate focus strength (0-1)
 * Higher turn count = stronger focus
 */
export function calculateFocusStrength(focus: FocusState): number {
  // Base strength from turn count (capped at 10 turns)
  const turnStrength = Math.min(focus.turnCount / 10, 1.0);
  
  // Urgency boost
  const urgencyBoost: Record<FocusState["urgency"], number> = {
    low: 0.1,
    medium: 0.2,
    high: 0.3,
    critical: 0.4,
  };

  return Math.min(1.0, turnStrength + urgencyBoost[focus.urgency]);
}
