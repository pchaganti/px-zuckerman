/**
 * Sleep mode trigger logic
 * Determines when sleep mode should be activated
 */

import type { ConversationEntry } from "../conversations/types.js";
import type { SleepConfig } from "./types.js";

/**
 * Determine if sleep mode should run
 */
export function shouldSleep(params: {
  entry?: Pick<ConversationEntry, "totalTokens" | "sleepCount" | "sleepAt">;
  config: SleepConfig;
  conversationMessageCount?: number;
}): boolean {
  const totalTokens = params.entry?.totalTokens;
  if (!totalTokens || totalTokens <= 0) return false;
  
  // Check minimum messages requirement
  if (params.conversationMessageCount !== undefined) {
    if (params.conversationMessageCount < params.config.minMessagesToSleep) {
      return false;
    }
  }

  // Check cooldown - don't sleep if we just slept recently
  const lastSleepAt = params.entry?.sleepAt;
  if (lastSleepAt) {
    const cooldownMs = params.config.cooldownMinutes * 60 * 1000;
    const timeSinceLastSleep = Date.now() - lastSleepAt;
    if (timeSinceLastSleep < cooldownMs) {
      return false;
    }
  }
  
  // Always allow sleep mode to run if cooldown checks pass
  return true;
}
