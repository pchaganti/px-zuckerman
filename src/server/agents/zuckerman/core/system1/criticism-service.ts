import type { LLMModel } from "@server/world/providers/llm/index.js";

export interface CriticismResult {
  satisfied: boolean;
  reason: string;
  missing: string[];
}

export class CriticismService {
  constructor(private judgeModel: LLMModel) {}

  async run(params: {
    userRequest: string;
    systemResult: string;
  }): Promise<CriticismResult> {
    const prompt = `User asked: "${params.userRequest}"

System did: ${params.systemResult}

Does the system result satisfy what the user asked for?

Respond in JSON:
{
  "satisfied": true/false,
  "reason": "brief explanation",
  "missing": ["what's still needed if not satisfied"]
}`;

    try {
      const response = await this.judgeModel.call({
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        responseFormat: "json_object",
      });
      return this.parseResponse(response.content);
    } catch (error) {
      console.warn(`[CriticismService] Validation failed:`, error);
      return { satisfied: false, reason: "Validation failed", missing: [] };
    }
  }

  private parseResponse(content: string): CriticismResult {
    try {
      const parsed = JSON.parse(String(content));
      return {
        satisfied: Boolean(parsed.satisfied),
        reason: String(parsed.reason || "No reason provided"),
        missing: Array.isArray(parsed.missing) ? parsed.missing.map(String) : [],
      };
    } catch (error) {
      console.warn(`[CriticismService] Parse failed:`, error);
      return { satisfied: false, reason: "Could not parse response", missing: [] };
    }
  }
}
