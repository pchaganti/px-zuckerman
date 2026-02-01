import { isGatewayRunning } from "@core/gateway/gateway-status.js";
import { startGatewayServer, type GatewayServer } from "@world/communication/gateway/server/index.js";

let gatewayServer: GatewayServer | null = null;
let startingPromise: Promise<{ success: boolean; error?: string }> | null = null;

/**
 * Start the gateway server (called from main process via IPC)
 * 
 * This is a thin wrapper that handles the actual server startup.
 * For renderer process, use gatewayService.ensureRunning() instead.
 */
export async function startGateway(
  host: string = "127.0.0.1",
  port: number = 18789
): Promise<{ success: boolean; error?: string }> {
  // Concurrent guard
  if (startingPromise) {
    return startingPromise;
  }

  startingPromise = startGatewayInternal(host, port);
  startingPromise.finally(() => {
    startingPromise = null;
  });

  return startingPromise;
}

/**
 * Internal function that actually starts the gateway server
 */
async function startGatewayInternal(
  host: string = "127.0.0.1",
  port: number = 18789
): Promise<{ success: boolean; error?: string }> {
  console.log(`[Gateway] Starting gateway on ${host}:${port}`);

  // Check if gateway is already running
  if (await isGatewayRunning(host, port)) {
    console.log(`[Gateway] Gateway already running - connecting to existing instance`);
    return { success: true };
  }

  // Clean up our own server instance if we have one
  if (gatewayServer) {
    try {
      await gatewayServer.close("Restarting");
    } catch (err) {
      console.warn("[Gateway] Error closing existing server:", err);
    }
    gatewayServer = null;
  }

  try {
    console.log(`[Gateway] Starting new gateway server...`);
    gatewayServer = await startGatewayServer({ host, port });
    console.log(`[Gateway] Gateway started successfully on ws://${host}:${port}`);
    return { success: true };
  } catch (err) {
    return handleStartError(err, host, port);
  }
}

/**
 * Handle errors when starting the gateway
 */
async function handleStartError(
  err: unknown,
  host: string,
  port: number
): Promise<{ success: boolean; error?: string }> {
  const error = err as NodeJS.ErrnoException;
  const errorCode = error.code;
  const errorMessage = error.message || "Unknown error";

  // Handle port already in use
  if (errorCode === "EADDRINUSE" || errorMessage.includes("EADDRINUSE")) {
    console.warn(`[Gateway] Port ${port} is already in use`);

    // Wait and check if gateway is running (might be starting up)
    await wait(500);
    if (await isGatewayRunning(host, port)) {
      console.log(`[Gateway] Gateway is running - connecting to existing instance`);
      gatewayServer = null;
      return { success: true };
    }

    // Wait longer - gateway might still be starting
    await wait(1000);
    if (await isGatewayRunning(host, port)) {
      console.log(`[Gateway] Gateway is now running - connecting to existing instance`);
      gatewayServer = null;
      return { success: true };
    }

    // Port is in use but gateway not responding - assume it's a gateway we can connect to
    console.warn(`[Gateway] Port in use but gateway not responding - assuming it's a gateway instance`);
    gatewayServer = null;
    return { success: true };
  }

  // For other errors, check if gateway started despite the error
  console.warn(`[Gateway] Error starting: ${errorMessage}`);
  await wait(500);
  if (await isGatewayRunning(host, port)) {
    console.log(`[Gateway] Gateway is running despite error - connecting to existing instance`);
    gatewayServer = null;
    return { success: true };
  }

  // Real error - gateway failed to start
  console.error(`[Gateway] Failed to start gateway:`, err);
  gatewayServer = null;
  return { success: false, error: errorMessage };
}

/**
 * Stop the gateway server
 */
export async function stopGateway(
  host: string = "127.0.0.1",
  port: number = 18789
): Promise<{ success: boolean; error?: string }> {
  try {
    if (gatewayServer) {
      await gatewayServer.close("Stopped via API");
      gatewayServer = null;
    }

    await wait(500);
    const stillRunning = await isGatewayRunning(host, port);
    
    if (stillRunning) {
      return { success: false, error: "Gateway is still running" };
    }

    return { success: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return { success: false, error: `Failed to stop gateway: ${errorMessage}` };
  }
}

/**
 * Get gateway status
 */
export async function getGatewayStatus(
  host: string = "127.0.0.1",
  port: number = 18789
): Promise<{
  running: boolean;
  address?: string;
  error?: string;
}> {
  try {
    const running = await isGatewayRunning(host, port);
    return {
      running,
      address: running ? `ws://${host}:${port}` : undefined,
    };
  } catch (err) {
    return {
      running: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

/**
 * Get gateway logs (empty for direct import - logs go to console)
 */
export function getGatewayLogs(
  limit?: number
): Array<{ timestamp: number; type: "stdout" | "stderr"; message: string }> {
  return [];
}

/**
 * Clear gateway logs
 */
export function clearGatewayLogs(): void {
  // No-op for direct import
}

/**
 * Cleanup on app exit
 */
export async function cleanupGateway(): Promise<void> {
  if (gatewayServer) {
    try {
      await gatewayServer.close("App shutting down");
    } catch (err) {
      console.error("[Gateway] Error during cleanup:", err);
    }
    gatewayServer = null;
  }
}

/**
 * Helper to wait
 */
function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
