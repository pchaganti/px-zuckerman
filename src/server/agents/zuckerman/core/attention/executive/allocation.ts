/**
 * Executive Attention - Resource Allocation
 * Makes high-level attention allocation decisions
 */

import type { AttentionState } from "../types.js";
import { calculateFocusStrength } from "../sustained/index.js";

/**
 * Attention resource allocation decision
 */
export interface AllocationDecision {
  memoryLimit: number;
  memoryTypes: string[];
  priority: number; // 0-1
}

/**
 * Make allocation decision based on attention state
 */
export function makeAllocationDecision(state: AttentionState): AllocationDecision {
  const urgency = state.alerting.urgency;
  const focus = state.focus;

  // Base allocation from urgency
  const urgencyAllocation: Record<AttentionState["alerting"]["urgency"], { limit: number; types: string[] }> = {
    critical: { limit: 20, types: ["semantic", "episodic", "procedural", "prospective", "emotional"] },
    high: { limit: 12, types: ["semantic", "episodic", "procedural"] },
    medium: { limit: 8, types: ["semantic", "episodic"] },
    low: { limit: 4, types: ["semantic"] },
  };

  const base = urgencyAllocation[urgency];

  // Adjust based on focus strength
  let limit = base.limit;
  if (focus) {
    const strength = calculateFocusStrength(focus);
    // Stronger focus = slightly more memories
    limit = Math.ceil(base.limit * (1 + strength * 0.2));
  }

  // Add working memory if there's a task
  const types = focus?.currentTask
    ? [...base.types, "working"]
    : base.types;

  // Priority based on urgency
  const priority: Record<AttentionState["alerting"]["urgency"], number> = {
    critical: 1.0,
    high: 0.8,
    medium: 0.5,
    low: 0.3,
  };

  return {
    memoryLimit: limit,
    memoryTypes: types,
    priority: priority[urgency],
  };
}
