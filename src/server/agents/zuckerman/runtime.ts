/**
 * Agent runtime entry point
 * Exports AgentService as the public API, with Self as internal implementation
 * 
 * NOTE: Self is only exported here for the registry/factory to use internally.
 * External modules should import AgentService from the main index instead.
 */
import { AgentService } from "./agent-service.js";
import { Self } from "./core/self/self.js";

// Export service as the public API (for backward compatibility)
export { AgentService as ZuckermanRuntime, AgentService };
export type { LoadedPrompts } from "./core/identity/identity-loader.js";

// Export Self ONLY for internal registry use (not for external consumption)
// External modules must use AgentService - this export is for factory/registry only
export { Self };

// Default export for easier discovery (returns service)
export default AgentService;
