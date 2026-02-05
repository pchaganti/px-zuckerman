/**
 * Selective Attention - Relevance Scoring
 * Scores relevance of information to current focus
 */

import type { FocusState, RelevanceScore } from "../types.js";

/**
 * Score relevance of content to focus state
 */
export function scoreRelevance(
  content: string,
  focus: FocusState | null
): RelevanceScore {
  if (!focus) {
    return { score: 0.5 }; // Neutral if no focus
  }

  let score = 0.0;
  let reasons: string[] = [];

  // Topic match
  const topicLower = focus.currentTopic.toLowerCase();
  const contentLower = content.toLowerCase();
  if (contentLower.includes(topicLower)) {
    score += 0.4;
    reasons.push("topic match");
  }

  // Task match
  if (focus.currentTask) {
    const taskLower = focus.currentTask.toLowerCase();
    if (contentLower.includes(taskLower)) {
      score += 0.3;
      reasons.push("task match");
    }
  }

  // Keyword overlap
  const topicWords = topicLower.split(/\s+/);
  const matchingWords = topicWords.filter(word =>
    contentLower.includes(word) && word.length > 2
  );
  if (matchingWords.length > 0) {
    score += (matchingWords.length / topicWords.length) * 0.3;
    reasons.push(`keyword overlap: ${matchingWords.length}/${topicWords.length}`);
  }

  // Normalize to 0-1
  score = Math.min(1.0, score);

  return {
    score,
    reason: reasons.join(", ") || "no match",
  };
}

/**
 * Filter items by relevance threshold
 */
export function filterByRelevance<T>(
  items: T[],
  scores: RelevanceScore[],
  threshold: number
): T[] {
  return items.filter((_, index) => scores[index]?.score >= threshold);
}
