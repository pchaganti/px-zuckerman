export interface RecurrenceRule {
  type: "none" | "daily" | "weekly" | "monthly" | "yearly" | "cron";
  interval?: number;
  endDate?: number;
  count?: number;
  cronExpression?: string;
  timezone?: string;
}

export interface EventAction {
  type: "agentTurn" | "systemEvent";
  agentId?: string; // Defaults to current agent
  sessionTarget?: "main" | "isolated"; // Defaults to "isolated"
  sessionIdSource?: string; // Session ID that created this cron event
  contextMessage?: string;
  actionMessage: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  startTime: number;
  endTime?: number;
  recurrence?: RecurrenceRule;
  action: EventAction;
  enabled: boolean;
  createdAt: number;
  lastTriggeredAt?: number;
  nextOccurrenceAt?: number;
}
