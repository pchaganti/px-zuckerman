export type ActivityType = 
  | "agent.run"
  | "agent.run.complete"
  | "agent.run.error"
  | "tool.call"
  | "tool.result"
  | "session.create"
  | "session.update"
  | "channel.message.incoming"
  | "channel.message.outgoing"
  | "calendar.event.triggered"
  | "calendar.event.created"
  | "calendar.event.updated"
  | "calendar.event.deleted";

export interface Activity {
  id: string;
  type: ActivityType;
  timestamp: number;
  agentId?: string;
  sessionId?: string;
  runId?: string;
  metadata: {
    // Agent run activities
    message?: string;
    response?: string;
    tokensUsed?: number;
    toolsUsed?: string[];
    error?: string;
    
    // Tool activities
    toolName?: string;
    toolArgs?: Record<string, unknown>;
    toolResult?: unknown;
    toolError?: string;
    
    // Session activities
    sessionType?: string;
    sessionLabel?: string;
    
    // Channel activities
    channel?: string;
    from?: string;
    to?: string;
    content?: string;
    
    // Calendar activities
    eventId?: string;
    eventTitle?: string;
    
    // Generic metadata
    [key: string]: unknown;
  };
}

export interface ActivityQuery {
  from?: number; // Start timestamp
  to?: number; // End timestamp
  agentId?: string;
  sessionId?: string;
  type?: ActivityType | ActivityType[];
  limit?: number;
  offset?: number;
}
