/**
 * Sleep mode configuration
 */

import type { SleepConfig } from "./types.js";

export const DEFAULT_COOLDOWN_MINUTES = 5;
export const DEFAULT_MIN_MESSAGES_TO_SLEEP = 10;
export const DEFAULT_KEEP_RECENT_MESSAGES = 10;

export const DEFAULT_SLEEP_PROMPT = [
  "Sleep mode: processing and consolidating memories.",
  "Memories are being automatically saved by the system.",
].join(" ");

export const DEFAULT_SLEEP_SYSTEM_PROMPT = [
  "Sleep mode: The system is automatically processing and consolidating memories.",
  "No action needed - memories are being saved automatically.",
].join(" ");

const normalizeNonNegativeInt = (value: unknown): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const int = Math.floor(value);
  return int >= 0 ? int : null;
};

const normalizeNonNegativeFloat = (value: unknown): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value >= 0 ? value : null;
};

/**
 * Resolve sleep settings from config
 */
export function resolveSleepConfig(cfg?: {
  sleep?: {
    enabled?: boolean;
    cooldownMinutes?: number;
    minMessagesToSleep?: number;
    keepRecentMessages?: number;
    compressionStrategy?: SleepConfig["compressionStrategy"];
    prompt?: string;
    systemPrompt?: string;
  };
  memoryFlush?: {
    enabled?: boolean;
    prompt?: string;
    systemPrompt?: string;
  };
}): SleepConfig | null {
  // Check sleep config first, fallback to memoryFlush for migration
  const sleepCfg = cfg?.sleep;
  const memoryFlushCfg = cfg?.memoryFlush;
  
  // If sleep explicitly disabled, return null
  if (sleepCfg?.enabled === false) {
    return null;
  }
  
  // If memoryFlush disabled and no sleep config, return null
  if (memoryFlushCfg?.enabled === false && !sleepCfg) {
    return null;
  }
  
  const enabled = sleepCfg?.enabled ?? memoryFlushCfg?.enabled ?? true;
  if (!enabled) return null;
  
  const cooldownMinutes = normalizeNonNegativeInt(sleepCfg?.cooldownMinutes) ?? DEFAULT_COOLDOWN_MINUTES;
  const minMessagesToSleep = normalizeNonNegativeInt(sleepCfg?.minMessagesToSleep) ?? DEFAULT_MIN_MESSAGES_TO_SLEEP;
  const keepRecentMessages = normalizeNonNegativeInt(sleepCfg?.keepRecentMessages) ?? DEFAULT_KEEP_RECENT_MESSAGES;
  const compressionStrategy = sleepCfg?.compressionStrategy ?? "hybrid";
  
  const prompt = sleepCfg?.prompt?.trim() || memoryFlushCfg?.prompt?.trim() || DEFAULT_SLEEP_PROMPT;
  const systemPrompt = sleepCfg?.systemPrompt?.trim() || memoryFlushCfg?.systemPrompt?.trim() || DEFAULT_SLEEP_SYSTEM_PROMPT;

  return {
    enabled,
    cooldownMinutes,
    minMessagesToSleep,
    keepRecentMessages,
    compressionStrategy,
    prompt,
    systemPrompt,
  };
}
