import type { Tool } from "./terminal/index.js";
import { createTerminalTool } from "./terminal/index.js";
import { createBrowserTool } from "./browser/index.js";
import { createCronTool } from "./cron/index.js";
import { createDeviceTool } from "./device/index.js";
import { createFilesystemTool } from "./filesystem/index.js";
import { createGrepTool } from "./grep/index.js";
import { createBatchTool, type BatchExecutionContext } from "./batch/index.js";

export class ZuckermanToolRegistry {
  private tools = new Map<string, Tool>();
  private sessionId: string = "";

  constructor(sessionId?: string) {
    this.sessionId = sessionId || "";
    
    // Register default tools
    this.register(createTerminalTool());
    this.register(createBrowserTool());
    this.register(createCronTool());
    this.register(createDeviceTool());
    this.register(createFilesystemTool());
    this.register(createGrepTool());
    
    // Register batch tool with execution context
    this.registerBatchTool();
  }

  /**
   * Register batch tool with execution context
   * This must be called after all other tools are registered
   */
  private registerBatchTool(): void {
    const batchContext: BatchExecutionContext = {
      sessionId: this.sessionId,
      executeTool: async (toolName, params, securityContext, executionContext) => {
        const tool = this.get(toolName);
        if (!tool) {
          return {
            success: false,
            error: `Tool "${toolName}" not found`,
          };
        }
        return await tool.handler(params, securityContext, executionContext);
      },
      getAvailableTools: () => {
        return Array.from(this.tools.keys()).filter(name => name !== "batch");
      },
    };

    this.register(createBatchTool(batchContext));
  }

  /**
   * Update session ID and re-register batch tool
   * This allows batch tool to have correct session context
   */
  setSessionId(sessionId: string): void {
    this.sessionId = sessionId;
    // Remove old batch tool if exists
    this.tools.delete("batch");
    // Re-register with new session ID
    this.registerBatchTool();
  }

  register(tool: Tool): void {
    this.tools.set(tool.definition.name, tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  list(): Tool[] {
    return Array.from(this.tools.values());
  }

  getDefinitions(): Array<{ name: string; description: string; parameters: unknown }> {
    return this.list().map((tool) => ({
      name: tool.definition.name,
      description: tool.definition.description,
      parameters: tool.definition.parameters,
    }));
  }
}
