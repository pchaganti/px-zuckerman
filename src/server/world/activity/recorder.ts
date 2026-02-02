import { randomUUID } from "node:crypto";
import { saveActivity } from "./storage.js";
import type { Activity, ActivityType } from "./types.js";

class ActivityRecorder {
  /**
   * Record an activity
   */
  async record(
    type: ActivityType,
    metadata: Activity["metadata"],
    options?: {
      agentId?: string;
      sessionId?: string;
      runId?: string;
      timestamp?: number;
    },
  ): Promise<void> {
    const activity: Activity = {
      id: randomUUID(),
      type,
      timestamp: options?.timestamp || Date.now(),
      agentId: options?.agentId,
      sessionId: options?.sessionId,
      runId: options?.runId,
      metadata,
    };
    
    try {
      await saveActivity(activity);
    } catch (error) {
      // Don't throw - activity recording should not break the main flow
      console.warn(`Failed to record activity ${type}:`, error);
    }
  }
  
  /**
   * Record agent run start
   */
  async recordAgentRunStart(
    agentId: string,
    sessionId: string,
    runId: string,
    message: string,
  ): Promise<void> {
    await this.record("agent.run", {
      message,
    }, {
      agentId,
      sessionId,
      runId,
    });
  }
  
  /**
   * Record agent run completion
   */
  async recordAgentRunComplete(
    agentId: string,
    sessionId: string,
    runId: string,
    response: string,
    tokensUsed?: number,
    toolsUsed?: string[],
  ): Promise<void> {
    await this.record("agent.run.complete", {
      response,
      tokensUsed,
      toolsUsed,
    }, {
      agentId,
      sessionId,
      runId,
    });
  }
  
  /**
   * Record agent run error
   */
  async recordAgentRunError(
    agentId: string,
    sessionId: string,
    runId: string,
    error: string,
  ): Promise<void> {
    await this.record("agent.run.error", {
      error,
    }, {
      agentId,
      sessionId,
      runId,
    });
  }
  
  /**
   * Record tool call
   */
  async recordToolCall(
    agentId: string,
    sessionId: string,
    runId: string,
    toolName: string,
    toolArgs: Record<string, unknown>,
  ): Promise<void> {
    await this.record("tool.call", {
      toolName,
      toolArgs,
    }, {
      agentId,
      sessionId,
      runId,
    });
  }
  
  /**
   * Record tool result
   */
  async recordToolResult(
    agentId: string,
    sessionId: string,
    runId: string,
    toolName: string,
    toolResult: unknown,
  ): Promise<void> {
    await this.record("tool.result", {
      toolName,
      toolResult,
    }, {
      agentId,
      sessionId,
      runId,
    });
  }
  
  /**
   * Record tool error
   */
  async recordToolError(
    agentId: string,
    sessionId: string,
    runId: string,
    toolName: string,
    error: string,
  ): Promise<void> {
    await this.record("tool.result", {
      toolName,
      toolError: error,
    }, {
      agentId,
      sessionId,
      runId,
    });
  }
  
  /**
   * Record session creation
   */
  async recordSessionCreate(
    agentId: string,
    sessionId: string,
    sessionType: string,
    sessionLabel: string,
  ): Promise<void> {
    await this.record("session.create", {
      sessionType,
      sessionLabel,
    }, {
      agentId,
      sessionId,
    });
  }
  
  /**
   * Record session update
   */
  async recordSessionUpdate(
    agentId: string,
    sessionId: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await this.record("session.update", metadata || {}, {
      agentId,
      sessionId,
    });
  }
  
  /**
   * Record incoming channel message
   */
  async recordChannelMessageIncoming(
    agentId: string,
    sessionId: string,
    channel: string,
    from: string,
    content: string,
  ): Promise<void> {
    await this.record("channel.message.incoming", {
      channel,
      from,
      content,
    }, {
      agentId,
      sessionId,
    });
  }
  
  /**
   * Record outgoing channel message
   */
  async recordChannelMessageOutgoing(
    agentId: string,
    sessionId: string,
    channel: string,
    to: string,
    content: string,
  ): Promise<void> {
    await this.record("channel.message.outgoing", {
      channel,
      to,
      content,
    }, {
      agentId,
      sessionId,
    });
  }
  
  /**
   * Record calendar event triggered
   */
  async recordCalendarEventTriggered(
    agentId: string,
    eventId: string,
    eventTitle: string,
    sessionId?: string,
  ): Promise<void> {
    await this.record("calendar.event.triggered", {
      eventId,
      eventTitle,
    }, {
      agentId,
      sessionId,
    });
  }
  
  /**
   * Record calendar event created
   */
  async recordCalendarEventCreated(
    agentId: string,
    eventId: string,
    eventTitle: string,
  ): Promise<void> {
    await this.record("calendar.event.created", {
      eventId,
      eventTitle,
    }, {
      agentId,
    });
  }
  
  /**
   * Record calendar event updated
   */
  async recordCalendarEventUpdated(
    agentId: string,
    eventId: string,
    eventTitle: string,
  ): Promise<void> {
    await this.record("calendar.event.updated", {
      eventId,
      eventTitle,
    }, {
      agentId,
    });
  }
  
  /**
   * Record calendar event deleted
   */
  async recordCalendarEventDeleted(
    agentId: string,
    eventId: string,
    eventTitle: string,
  ): Promise<void> {
    await this.record("calendar.event.deleted", {
      eventId,
      eventTitle,
    }, {
      agentId,
    });
  }
}

// Singleton instance
export const activityRecorder = new ActivityRecorder();
