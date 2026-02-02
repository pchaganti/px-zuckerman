import type { Tool } from "../terminal/index.js";
import { isToolAllowed } from "@server/world/execution/security/policy/tool-policy.js";
import { getChannelRegistry } from "./registry.js";
import { SessionManager, deriveSessionKey } from "@server/agents/zuckerman/sessions/index.js";
import { loadSessionStore, resolveSessionStorePath } from "@server/agents/zuckerman/sessions/store.js";

export function createTelegramTool(): Tool {
  return {
    definition: {
      name: "telegram",
      description: "Send a message or media (images, audio, files) via Telegram. Use this when the user asks you to send a Telegram message, image, or file. Include image or file paths in the message - the tool will automatically detect and send them. If the user asks to send a message to themselves or 'me', you can omit the 'to' parameter and it will automatically use the current Telegram chat. Otherwise, provide the Telegram chat ID (numeric string).",
      parameters: {
        type: "object",
        properties: {
          message: {
            type: "string",
            description: "The message text to send. To send images or files, include the file path in the message. The tool will automatically detect and send media files.",
          },
          to: {
            type: "string",
            description: "Optional: Telegram chat ID (user ID or chat ID as a numeric string, e.g., '123456789'). If omitted or set to 'me', will send to the current Telegram chat where the user is messaging from.",
          },
        },
        required: ["message"],
      },
    },
    handler: async (params, securityContext, executionContext) => {
      try {
        // Check if tool is allowed
        if (securityContext && !isToolAllowed("telegram", securityContext.toolPolicy)) {
          return {
            success: false,
            error: "Telegram tool is not allowed in this security context",
          };
        }

        const { message, to } = params as { message: string; to?: string };

        if (!message) {
          return {
            success: false,
            error: "Message is required",
          };
        }

        // Try to auto-detect chat ID from session if not provided
        let chatId = to;
        if (!chatId || chatId === "me" || chatId.toLowerCase() === "myself") {
          if (executionContext?.sessionId && securityContext?.agentId) {
            try {
              // Use SessionManager to get session state, then derive sessionKey for reliable lookup
              const sessionManager = new SessionManager(securityContext.agentId);
              const sessionState = sessionManager.getSession(executionContext.sessionId);
              
              if (sessionState) {
                // Derive sessionKey from session state
                const sessionKey = deriveSessionKey(
                  securityContext.agentId,
                  sessionState.session.type,
                  sessionState.session.label
                );
                
                // Load session store and look up entry by sessionKey (more reliable than searching by sessionId)
                const storePath = resolveSessionStorePath(securityContext.agentId);
                const store = loadSessionStore(storePath);
                const sessionEntry = store[sessionKey];
                
                // Try to get chat ID from delivery context
                if (sessionEntry) {
                  // Check if this session is from Telegram channel
                  if (sessionEntry.lastChannel === "telegram" || sessionEntry.origin?.channel === "telegram") {
                    chatId = sessionEntry.deliveryContext?.to || 
                            sessionEntry.lastTo;
                  }
                }
              } else {
                // Fallback: try to find by sessionId if session not in memory
                const storePath = resolveSessionStorePath(securityContext.agentId);
                const store = loadSessionStore(storePath);
                const sessionEntry = Object.values(store).find(
                  entry => entry.sessionId === executionContext.sessionId
                );
                
                if (sessionEntry && (sessionEntry.lastChannel === "telegram" || sessionEntry.origin?.channel === "telegram")) {
                  chatId = sessionEntry.deliveryContext?.to || sessionEntry.lastTo;
                }
              }
            } catch (err) {
              console.warn("[Telegram] Failed to load session for auto-detection:", err);
            }
          }
          
          if (!chatId) {
            return {
              success: false,
              error: "Chat ID is required. If you're replying to a Telegram message in this conversation, the chat ID should be automatically detected. Otherwise, please provide the Telegram chat ID (numeric string).",
            };
          }
        }

        // Check if channel registry is available
        const channelRegistry = getChannelRegistry();
        if (!channelRegistry) {
          return {
            success: false,
            error: "Telegram channel registry is not available. Make sure Telegram is configured and connected.",
          };
        }

        // Get Telegram channel
        const telegramChannel = channelRegistry.get("telegram");
        if (!telegramChannel) {
          return {
            success: false,
            error: "Telegram channel is not configured. Please set up Telegram in settings.",
          };
        }

        // Check if connected
        if (!telegramChannel.isConnected()) {
          return {
            success: false,
            error: "Telegram is not connected. Please connect Telegram in settings first.",
          };
        }

        // Send message
        await telegramChannel.send(message, chatId);

        return {
          success: true,
          result: `Message sent successfully to Telegram chat ${chatId}`,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Failed to send Telegram message";
        return {
          success: false,
          error: errorMessage,
        };
      }
    },
  };
}
