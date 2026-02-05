/**
 * Alerting System - Readiness State
 * Maintains alertness/readiness state
 */

import type { UrgencyLevel } from "../types.js";

/**
 * Readiness state based on urgency
 */
export interface ReadinessState {
  level: UrgencyLevel;
  alertness: number; // 0-1, how alert/ready
  lastUpdated: number;
}

/**
 * Calculate alertness from urgency
 */
export function calculateAlertness(urgency: UrgencyLevel): number {
  const mapping: Record<UrgencyLevel, number> = {
    low: 0.3,
    medium: 0.5,
    high: 0.8,
    critical: 1.0,
  };
  return mapping[urgency];
}

/**
 * Create readiness state
 */
export function createReadinessState(urgency: UrgencyLevel): ReadinessState {
  return {
    level: urgency,
    alertness: calculateAlertness(urgency),
    lastUpdated: Date.now(),
  };
}
