/**
 * Attention System
 * Brain-inspired attention system with multiple subsystems
 */

// Core types
export * from "./types.js";

// Subsystems
export * from "./alerting/index.js";
export * from "./orienting/index.js";
export * from "./sustained/index.js";
export * from "./selective/index.js";
export * from "./executive/index.js";

// Main controller
export { ExecutiveController } from "./executive/controller.js";
export type { AttentionState, AttentionConfig, FocusState } from "./types.js";
