import type { AgentRuntime, AgentRunParams, AgentRunResult } from "@server/world/runtime/agents/types.js";
import type { ConversationId, ConversationState, Conversation, ConversationKey, ConversationType, ConversationLabel } from "./conversations/types.js";
import { ConversationManager } from "./conversations/index.js";
import { ConversationRouter } from "./conversations/router.js";
import { Self } from "./core/self/self.js";
import { IdentityLoader } from "./core/identity/identity-loader.js";
import { agentDiscovery } from "@server/agents/discovery.js";

/**
 * Public API for Zuckerman agent
 * This service exposes only the public interface and prevents external access to internal implementation
 * 
 * Implements AgentRuntime interface to work with AgentRuntimeFactory
 */
export class AgentService implements AgentRuntime {
  private readonly runtime: Self;
  private readonly conversationManager: ConversationManager;
  private readonly conversationRouter: ConversationRouter;
  private readonly identityLoader: IdentityLoader;
  private readonly agentDir: string;
  readonly agentId: string;

  constructor(agentId: string) {
    this.agentId = agentId;
    // AgentService always creates its own ConversationManager internally
    this.conversationManager = new ConversationManager(this.agentId);
    this.conversationRouter = new ConversationRouter(this.agentId, this.conversationManager);
    this.runtime = new Self(this.agentId, this.conversationManager);
    this.identityLoader = new IdentityLoader();
    
    // Get agent directory from discovery service
    const metadata = agentDiscovery.getMetadata(this.agentId);
    if (!metadata) {
      throw new Error(`Agent "${this.agentId}" not found in discovery service`);
    }
    this.agentDir = metadata.agentDir;
  }

  /**
   * Initialize the agent (called once when agent is created)
   */
  async initialize(): Promise<void> {
    await this.runtime.initialize();
  }

  /**
   * Run the agent with given parameters
   */
  async run(params: AgentRunParams): Promise<AgentRunResult> {
    return this.runtime.run(params);
  }

  /**
   * Load agent prompts (for inspection/debugging)
   */
  async loadPrompts(): Promise<{ files: Map<string, string> }> {
    const prompts = await this.identityLoader.loadPrompts(this.agentDir);
    return { files: prompts.files };
  }

  /**
   * Clear caches (for hot reload)
   */
  clearCache(): void {
    // Clear identity loader cache if available
    if (this.identityLoader.clearCache) {
      this.identityLoader.clearCache(this.agentDir);
    }
  }

  /**
   * Get conversation by ID (read-only)
   */
  getConversation(conversationId: ConversationId): ConversationState | undefined {
    return this.conversationManager.getConversation(conversationId);
  }

  /**
   * List all conversations (read-only)
   */
  listConversations(): Conversation[] {
    return this.conversationManager.listConversations();
  }

  /**
   * Create a new conversation (for routing/setup)
   */
  createConversation(
    label: string,
    type: "main" | "group" | "channel" = "main",
    agentId?: string
  ): Conversation {
    return this.conversationManager.createConversation(label, type, agentId);
  }

  /**
   * Delete a conversation (for API operations)
   */
  deleteConversation(conversationId: ConversationId): boolean {
    return this.conversationManager.deleteConversation(conversationId);
  }

  /**
   * Get or create main conversation (for routing)
   */
  getOrCreateMainConversation(agentId?: string): Conversation {
    return this.conversationRouter.getOrCreateMainConversation(agentId);
  }

  /**
   * Get or create conversation by key (for routing from world)
   */
  getOrCreateConversationByKey(
    conversationKey: ConversationKey,
    type: ConversationType,
    label?: ConversationLabel,
  ): Conversation {
    return this.conversationRouter.getOrCreateConversation(conversationKey, type, label, this.agentId);
  }

}
