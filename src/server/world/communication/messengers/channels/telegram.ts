import { Bot, Context, InputFile } from "grammy";
import type { Channel, ChannelMessage } from "./types.js";
import type { TelegramConfig } from "@server/world/config/types.js";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

enum ChannelState {
  IDLE = "idle",
  CONNECTING = "connecting",
  CONNECTED = "connected",
  STOPPING = "stopping",
}

export class TelegramChannel implements Channel {
  id: string = "telegram";
  type = "telegram" as const;
  private bot: Bot | null = null;
  private config: TelegramConfig;
  private messageHandlers: Array<(message: ChannelMessage) => void> = [];
  private state: ChannelState = ChannelState.IDLE;
  private statusCallback?: (status: {
    status: "connected" | "connecting" | "disconnected";
  }) => void;

  constructor(config: TelegramConfig, statusCallback?: (status: {
    status: "connected" | "connecting" | "disconnected";
  }) => void) {
    this.config = config;
    this.statusCallback = statusCallback;
  }

  async start(): Promise<void> {
    if (this.state === ChannelState.CONNECTED) {
      return;
    }

    if (!this.config.enabled) {
      console.log("[Telegram] Channel is disabled in config");
      this.state = ChannelState.IDLE;
      return;
    }

    if (!this.config.botToken) {
      console.error("[Telegram] Bot token is required");
      this.state = ChannelState.IDLE;
      return;
    }

    // Don't start if stopping
    if (this.state === ChannelState.STOPPING) {
      return;
    }

    this.state = ChannelState.CONNECTING;
    this.notifyStatus("connecting");

    try {
      this.bot = new Bot(this.config.botToken);

      // Verify bot token and check for conflicts BEFORE starting
      try {
        await this.bot.api.getMe();
      } catch (verifyError: any) {
        // If we get a 409 conflict, another instance is running
        if (verifyError?.error_code === 409 || 
            (verifyError?.description && verifyError.description.includes("terminated by other getUpdates request"))) {
          console.error("[Telegram] Cannot start: Another bot instance is already running with this token. Only one instance can run at a time. Please stop the other instance first.");
          this.bot = null;
          this.state = ChannelState.IDLE;
          this.notifyStatus("disconnected");
          return;
        }
        // For other errors (like invalid token), throw
        throw verifyError;
      }

      // Handle incoming messages
      this.bot.on("message:text", async (ctx: Context) => {
        await this.handleIncomingMessage(ctx);
      });

      // Handle edited messages
      this.bot.on("edited_message:text", async (ctx: Context) => {
        await this.handleIncomingMessage(ctx);
      });

      // Add error handler
      this.bot.catch((err) => {
        console.error("[Telegram] Error in bot handler:", err);
      });

      // Start bot - bot.start() doesn't resolve, it runs indefinitely
      // So we start it without awaiting and mark as running immediately
      this.bot.start().catch((err) => {
        console.error("[Telegram] Bot start error:", err);
        this.state = ChannelState.IDLE;
        this.notifyStatus("disconnected");
      });
      
      // Mark as connected immediately after starting (bot.start() doesn't resolve)
      this.state = ChannelState.CONNECTED;
      console.log("[Telegram] Bot started successfully");
      this.notifyStatus("connected");
    } catch (error: any) {
      console.error("[Telegram] Failed to start:", error);
      this.bot = null;
      this.state = ChannelState.IDLE;
      this.notifyStatus("disconnected");
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (this.state === ChannelState.STOPPING || this.state === ChannelState.IDLE) {
      return;
    }

    this.state = ChannelState.STOPPING;

    if (this.bot) {
      await this.bot.stop();
      this.bot = null;
    }

    this.state = ChannelState.IDLE;
    this.notifyStatus("disconnected");
  }

  async send(message: string, to: string): Promise<void> {
    if (this.state !== ChannelState.CONNECTED || !this.bot) {
      throw new Error("Telegram channel is not connected");
    }

    try {
      // Parse MEDIA: paths and markdown image links from the message
      const mediaPaths: string[] = [];
      const lines = message.split("\n");
      const textLines: string[] = [];
      let hasAudioAsVoice = false;

      // Regex to match markdown image links: ![alt](path) or [![alt](path)](url)
      const markdownImageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;

      for (const line of lines) {
        if (line.trim() === "[[audio_as_voice]]") {
          hasAudioAsVoice = true;
          continue;
        }
        if (line.startsWith("MEDIA:")) {
          const mediaPath = line.substring(6).trim();
          if (mediaPath) {
            mediaPaths.push(mediaPath);
          }
          continue;
        }
        
        // Check for markdown image links in the line
        let modifiedLine = line;
        const matches = Array.from(line.matchAll(markdownImageRegex));
        for (const match of matches) {
          const imagePath = match[2];
          // Handle sandbox: protocol paths
          if (imagePath.startsWith("sandbox:")) {
            // Extract path from sandbox: protocol
            const actualPath = imagePath.replace("sandbox:", "").trim();
            if (actualPath) {
              mediaPaths.push(actualPath);
              // Remove the markdown image link from the text
              modifiedLine = modifiedLine.replace(match[0], match[1] || "").trim();
            }
          } else if (!imagePath.startsWith("http")) {
            // Local file path (not a URL)
            mediaPaths.push(imagePath);
            // Remove the markdown image link from the text
            modifiedLine = modifiedLine.replace(match[0], match[1] || "").trim();
          }
        }
        
        if (modifiedLine.trim()) {
          textLines.push(modifiedLine);
        }
      }

      const textContent = textLines.join("\n").trim();

      // Send media files if any
      for (const mediaPath of mediaPaths) {
        try {
          // Resolve path (handle ~ and relative paths)
          let resolvedPath = mediaPath;
          if (mediaPath.startsWith("~")) {
            resolvedPath = mediaPath.replace("~", homedir());
          } else if (!mediaPath.startsWith("/")) {
            // Relative path - try resolving from home directory
            resolvedPath = join(homedir(), mediaPath);
          }

          if (!existsSync(resolvedPath)) {
            console.warn(`[Telegram] Media file not found: ${resolvedPath}`);
            continue;
          }

          // Determine if it's an image or audio file
          const ext = resolvedPath.toLowerCase().split(".").pop();
          const isImage = ["png", "jpg", "jpeg", "gif", "webp"].includes(ext || "");
          const isAudio = ["mp3", "ogg", "opus", "wav", "m4a"].includes(ext || "");

          if (isImage) {
            // Send as photo
            const file = new InputFile(resolvedPath);
            await this.bot.api.sendPhoto(Number(to), file, {
              caption: mediaPaths.length === 1 && textContent ? textContent : undefined,
            });
          } else if (isAudio && hasAudioAsVoice && ext === "opus") {
            // Send as voice message (for opus files with audio_as_voice tag)
            const file = new InputFile(resolvedPath);
            await this.bot.api.sendVoice(Number(to), file);
          } else if (isAudio) {
            // Send as audio file
            const file = new InputFile(resolvedPath);
            await this.bot.api.sendAudio(Number(to), file);
          } else {
            // Send as document
            const file = new InputFile(resolvedPath);
            await this.bot.api.sendDocument(Number(to), file, {
              caption: mediaPaths.length === 1 && textContent ? textContent : undefined,
            });
          }
        } catch (error) {
          console.error(`[Telegram] Failed to send media file ${mediaPath}:`, error);
          // Continue with other media files
        }
      }

      // Send text message if there's text content and no media, or if there are multiple media files
      if (textContent && (mediaPaths.length === 0 || mediaPaths.length > 1)) {
        await this.bot.api.sendMessage(Number(to), textContent);
      }
    } catch (error) {
      console.error(`[Telegram] Failed to send message to ${to}:`, error);
      throw error;
    }
  }

  async sendPhoto(photoPath: string, to: string, caption?: string): Promise<void> {
    if (this.state !== ChannelState.CONNECTED || !this.bot) {
      throw new Error("Telegram channel is not connected");
    }

    try {
      // Resolve path
      let resolvedPath = photoPath;
      if (photoPath.startsWith("~")) {
        resolvedPath = photoPath.replace("~", homedir());
      } else if (!photoPath.startsWith("/")) {
        resolvedPath = join(homedir(), photoPath);
      }

      if (!existsSync(resolvedPath)) {
        throw new Error(`Photo file not found: ${resolvedPath}`);
      }

      const file = new InputFile(resolvedPath);
      await this.bot.api.sendPhoto(Number(to), file, {
        caption,
      });
    } catch (error) {
      console.error(`[Telegram] Failed to send photo to ${to}:`, error);
      throw error;
    }
  }

  onMessage(handler: (message: ChannelMessage) => void): void {
    this.messageHandlers.push(handler);
  }

  private async handleIncomingMessage(ctx: Context): Promise<void> {
    const message = ctx.message;
    if (!message || !message.text) {
      return;
    }

    const chat = message.chat;
    const fromId = message.from?.id.toString() || "";
    const chatId = chat.id.toString();
    const isGroup = chat.type === "group" || chat.type === "supergroup";

    // Check allowlist for DMs
    if (!isGroup && this.config.dmPolicy === "allowlist" && this.config.allowFrom) {
      const isAllowed = this.config.allowFrom.includes("*") || 
                       this.config.allowFrom.includes(fromId);
      
      if (!isAllowed) {
        console.log(`[Telegram] Message from ${fromId} blocked (not in allowlist)`);
        return;
      }
    }

    // Check group policy
    if (isGroup && this.config.groupPolicy === "allowlist") {
      // For groups, check if group is in allowlist (if groups config exists)
      const groupConfig = this.config.groups?.[chatId];
      if (!groupConfig && !this.config.groups?.["*"]) {
        console.log(`[Telegram] Message from group ${chatId} blocked (not in allowlist)`);
        return;
      }
    }

    // Check mention requirement for groups
    if (isGroup && message.text) {
      const groupConfig = this.config.groups?.[chatId] || this.config.groups?.["*"];
      if (groupConfig?.requireMention) {
        // Check if bot was mentioned
        const botInfo = await this.bot!.api.getMe();
        const mentioned = message.entities?.some(
          (entity) => entity.type === "mention" && 
                     message.text!.substring(entity.offset, entity.offset + entity.length) === `@${botInfo.username}`
        ) || message.text.includes(`@${botInfo.username}`);
        
        if (!mentioned) {
          // Store for context but don't trigger reply
          return;
        }
      }
    }

    const channelMessage: ChannelMessage = {
      id: message.message_id.toString(),
      channelId: this.id,
      from: chatId,
      content: message.text,
      timestamp: message.date * 1000,
      metadata: {
        peerId: chatId,
        peerKind: isGroup ? "group" : "dm",
        messageId: message.message_id,
        isGroup,
        fromId,
        fromUsername: message.from?.username,
        chatTitle: isGroup ? chat.title : undefined,
      },
    };

    // Notify all handlers
    for (const handler of this.messageHandlers) {
      try {
        handler(channelMessage);
      } catch (error) {
        console.error("[Telegram] Error in message handler:", error);
      }
    }
  }

  isConnected(): boolean {
    return this.state === ChannelState.CONNECTED && this.bot !== null;
  }

  private notifyStatus(status: "connected" | "connecting" | "disconnected"): void {
    if (this.statusCallback) {
      this.statusCallback({ status });
    }
  }
}
