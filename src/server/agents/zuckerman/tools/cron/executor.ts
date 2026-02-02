import type { CalendarEvent } from "./types.js";
import { getCronExecutionContext } from "./execution-context.js";
import { resolveAgentLandDir } from "@server/world/land/resolver.js";
import { loadConfig } from "@server/world/config/index.js";
import { resolveSecurityContext } from "@server/world/execution/security/context/index.js";
import { deriveSessionKey } from "@server/agents/zuckerman/sessions/index.js";
import { loadSessionStore, resolveSessionStorePath } from "@server/agents/zuckerman/sessions/store.js";
import { activityRecorder } from "@server/world/activity/index.js";
import { saveEvents } from "./storage.js";
import { scheduleEvent, calculateNextOccurrence } from "./scheduler.js";

// Execute an event
export async function executeEvent(event: CalendarEvent, eventsMap: Map<string, CalendarEvent>): Promise<void> {
  console.log(`[Calendar] Executing event: ${event.id} - ${event.title} at ${new Date().toISOString()}`);
  event.lastTriggeredAt = Date.now();

  const agentId = event.action.agentId || "zuckerman";
  
  // Record calendar event triggered
  await activityRecorder.recordCalendarEventTriggered(
    agentId,
    event.id,
    event.title,
  ).catch((err) => {
    console.warn("Failed to record calendar event triggered:", err);
  });

  try {
    if (event.action.type === "systemEvent") {
      console.log(`[Calendar] System event: ${event.action.actionMessage || ""}`);
    } else if (event.action.type === "agentTurn") {
      await executeAgentTurn(event, eventsMap);
    } else {
      console.warn(`[Calendar] Unknown action type: ${(event.action as any).type}`);
    }
  } catch (error) {
    console.error(`[Calendar] Error executing event ${event.id}:`, error);
    if (error instanceof Error) {
      console.error(`[Calendar] Error stack:`, error.stack);
    }
    // Don't rethrow - allow scheduler to continue
  }

  // Update next occurrence for recurring events
  if (event.recurrence && event.recurrence.type !== "none") {
    event.nextOccurrenceAt = calculateNextOccurrence(event);
    if (event.nextOccurrenceAt) {
      scheduleEvent(event, eventsMap);
    }
  }

  saveEvents(eventsMap);
}

// Execute an agent turn action
async function executeAgentTurn(event: CalendarEvent, eventsMap: Map<string, CalendarEvent>): Promise<void> {
  const action = event.action;
  if (action.type !== "agentTurn" || !action.actionMessage) {
    console.warn(`[Calendar] Invalid agentTurn action for event ${event.id}`);
    return;
  }

  // Get execution context
  const context = getCronExecutionContext();
  if (!context || !context.agentFactory) {
    console.error(`[Calendar] Execution context not available for event ${event.id}`);
    return;
  }

  const agentId = action.agentId || "zuckerman";
  const agentFactory = context.agentFactory;
  const channelRegistry = context.channelRegistry;

  // Get runtime
  let runtime;
  try {
    runtime = await agentFactory.getRuntime(agentId);
    if (!runtime) {
      console.error(`[Calendar] Failed to get runtime for agent ${agentId}`);
      return;
    }
  } catch (error) {
    console.error(`[Calendar] Error getting runtime for agent ${agentId}:`, error);
    return;
  }

  // Get session manager
  const sessionManager = agentFactory.getSessionManager(agentId);

  // Create or get session
  let sessionId: string;
  let isNewSession = false;
  
  const sessionTarget = action.sessionTarget || "isolated";
  if (sessionTarget === "isolated") {
    // Create temporary isolated session
    const session = sessionManager.createSession(`cron-${event.id}`, "main", agentId);
    sessionId = session.id;
    isNewSession = true;
  } else {
    // Use main session - get or create
    const sessionKey = deriveSessionKey(agentId, "main");
    const storePath = resolveSessionStorePath(agentId);
    const store = loadSessionStore(storePath);
    const sessionEntry = store[sessionKey];
    
    if (sessionEntry) {
      sessionId = sessionEntry.sessionId;
    } else {
      const session = sessionManager.createSession("main", "main", agentId);
      sessionId = session.id;
      isNewSession = true;
    }
  }

  // Get session state
  const session = sessionManager.getSession(sessionId);
  if (!session) {
    console.error(`[Calendar] Failed to get session ${sessionId}`);
    return;
  }

  // Load config and resolve security context
  const config = await loadConfig();
  const landDir = resolveAgentLandDir(config, agentId);
  const securityContext = await resolveSecurityContext(
    config.security,
    sessionId,
    session.session.type,
    agentId,
    landDir,
  );

  // Run agent
  console.log(`[Calendar] Running agent turn for event ${event.id} in session ${sessionId}`);
  if (action.sessionIdSource) {
    console.log(`[Calendar] Event created by session: ${action.sessionIdSource}`);
  }
  console.log(`[Calendar] Action message: "${action.actionMessage}"`);
  if (action.contextMessage) {
    console.log(`[Calendar] Context message: "${action.contextMessage}"`);
  }
  
  // Prepend contextMessage to actionMessage if provided
  const message = action.contextMessage 
    ? `${action.contextMessage}\n\n${action.actionMessage}`
    : action.actionMessage;
  
  const runParams: any = {
    sessionId,
    message,
    securityContext,
  };
  
  let result;
  try {
    console.log(`[Calendar] Calling runtime.run() for event ${event.id}...`);
    
    // Add timeout to prevent hanging (5 minutes max)
    const timeoutMs = 5 * 60 * 1000;
    const runPromise = runtime.run(runParams);
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Agent run timeout after ${timeoutMs}ms`));
      }, timeoutMs);
    });
    
    result = await Promise.race([runPromise, timeoutPromise]);
    console.log(`[Calendar] Agent completed for event ${event.id}, got response (length: ${result.response?.length || 0})`);
  } catch (error) {
    console.error(`[Calendar] Agent run failed for event ${event.id}:`, error);
    if (error instanceof Error) {
      console.error(`[Calendar] Error message:`, error.message);
      console.error(`[Calendar] Error stack:`, error.stack);
    }
    // Don't rethrow - log and continue so scheduler doesn't crash
    return;
  }

  // Log agent response
  const responsePreview = result.response?.substring(0, 300) || "(no response)";
  console.log(`[Calendar] Agent response for event ${event.id} (${result.response?.length || 0} chars):`, responsePreview);
  
  // Note: toolsUsed is not currently returned by runtime, but tools are executed during the run
  // Check session messages to see if tools were called
  const sessionAfter = sessionManager.getSession(sessionId);
  const toolMessages = sessionAfter?.messages.filter(m => m.role === "tool") || [];
  if (toolMessages.length > 0) {
    console.log(`[Calendar] Agent executed ${toolMessages.length} tool call(s) for event ${event.id}`);
  } else {
    console.log(`[Calendar] Agent did not execute any tools for event ${event.id} - response was: "${responsePreview}"`);
  }

  // Add response to session
  sessionManager.addMessage(sessionId, "assistant", result.response);

  // Note: Agent uses its tools (like telegram) to send messages
  // Channel metadata is already set on the session, so tools can access it
  // No need for separate delivery logic - the agent handles it
}
