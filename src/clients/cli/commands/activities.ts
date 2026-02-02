import { Command } from "commander";
import { GatewayClient } from "../gateway-client.js";
import { ensureGatewayRunning } from "../gateway-utils.js";
import { outputJson, shouldOutputJson } from "../utils/json-output.js";

export function createActivitiesCommand(): Command {
  const cmd = new Command("activities")
    .description("View agent activity logs");

  cmd
    .command("list")
    .description("List activities")
    .option("--from <timestamp>", "Start timestamp (milliseconds)")
    .option("--to <timestamp>", "End timestamp (milliseconds)")
    .option("--date <date>", "Date filter (YYYY-MM-DD)")
    .option("--agent <agentId>", "Filter by agent ID")
    .option("--session <sessionId>", "Filter by session ID")
    .option("--type <type>", "Filter by activity type (comma-separated)")
    .option("--limit <limit>", "Limit number of results", "100")
    .option("--offset <offset>", "Offset for pagination", "0")
    .option("--json", "Output as JSON")
    .option("--host <host>", "Gateway host", "127.0.0.1")
    .option("--port <port>", "Gateway port", "18789")
    .action(async (options) => {
      await ensureGatewayRunning(options.host, options.port);

      const client = new GatewayClient(options.host || "127.0.0.1", options.port ? parseInt(options.port, 10) : 18789);
      await client.connect();

      try {
        // Parse date if provided
        let from: number | undefined;
        let to: number | undefined;
        
        if (options.date) {
          const date = new Date(options.date);
          date.setHours(0, 0, 0, 0);
          from = date.getTime();
          date.setHours(23, 59, 59, 999);
          to = date.getTime();
        } else {
          from = options.from ? parseInt(options.from, 10) : undefined;
          to = options.to ? parseInt(options.to, 10) : undefined;
        }

        // Parse type filter
        let type: string | string[] | undefined;
        if (options.type) {
          type = options.type.includes(",") 
            ? options.type.split(",").map(t => t.trim())
            : options.type;
        }

        const response = await client.call("activities.list", {
          from,
          to,
          agentId: options.agent,
          sessionId: options.session,
          type,
          limit: options.limit ? parseInt(options.limit, 10) : undefined,
          offset: options.offset ? parseInt(options.offset, 10) : undefined,
        });

        if (shouldOutputJson(options)) {
          outputJson(response, options);
        } else {
          if (response.activities && response.activities.length > 0) {
            console.log(`Found ${response.count || response.activities.length} activities:\n`);
            for (const activity of response.activities) {
              const date = new Date(activity.timestamp).toISOString();
              console.log(`[${date}] ${activity.type}`);
              if (activity.agentId) console.log(`  Agent: ${activity.agentId}`);
              if (activity.sessionId) console.log(`  Session: ${activity.sessionId}`);
              if (activity.runId) console.log(`  Run: ${activity.runId}`);
              if (activity.metadata) {
                const metaKeys = Object.keys(activity.metadata);
                if (metaKeys.length > 0) {
                  console.log(`  Metadata: ${JSON.stringify(activity.metadata, null, 2).split("\n").join("\n  ")}`);
                }
              }
              console.log();
            }
          } else {
            console.log("No activities found");
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        if (shouldOutputJson(options)) {
          outputJson({ error: errorMessage }, options);
        } else {
          console.error(`Error: ${errorMessage}`);
        }
        process.exit(1);
      } finally {
        await client.disconnect();
      }
    });

  cmd
    .command("count")
    .description("Get activity count")
    .option("--from <timestamp>", "Start timestamp (milliseconds)")
    .option("--to <timestamp>", "End timestamp (milliseconds)")
    .option("--date <date>", "Date filter (YYYY-MM-DD)")
    .option("--agent <agentId>", "Filter by agent ID")
    .option("--session <sessionId>", "Filter by session ID")
    .option("--type <type>", "Filter by activity type (comma-separated)")
    .option("--json", "Output as JSON")
    .option("--host <host>", "Gateway host", "127.0.0.1")
    .option("--port <port>", "Gateway port", "18789")
    .action(async (options) => {
      await ensureGatewayRunning(options.host, options.port);

      const client = new GatewayClient(options.host || "127.0.0.1", options.port ? parseInt(options.port, 10) : 18789);
      await client.connect();

      try {
        // Parse date if provided
        let from: number | undefined;
        let to: number | undefined;
        
        if (options.date) {
          const date = new Date(options.date);
          date.setHours(0, 0, 0, 0);
          from = date.getTime();
          date.setHours(23, 59, 59, 999);
          to = date.getTime();
        } else {
          from = options.from ? parseInt(options.from, 10) : undefined;
          to = options.to ? parseInt(options.to, 10) : undefined;
        }

        // Parse type filter
        let type: string | string[] | undefined;
        if (options.type) {
          type = options.type.includes(",") 
            ? options.type.split(",").map(t => t.trim())
            : options.type;
        }

        const response = await client.call("activities.count", {
          from,
          to,
          agentId: options.agent,
          sessionId: options.session,
          type,
        });

        if (shouldOutputJson(options)) {
          outputJson(response, options);
        } else {
          console.log(`Total activities: ${response.count || 0}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        if (shouldOutputJson(options)) {
          outputJson({ error: errorMessage }, options);
        } else {
          console.error(`Error: ${errorMessage}`);
        }
        process.exit(1);
      } finally {
        await client.disconnect();
      }
    });

  cmd
    .command("range")
    .description("Get available date range for activities")
    .option("--json", "Output as JSON")
    .option("--host <host>", "Gateway host", "127.0.0.1")
    .option("--port <port>", "Gateway port", "18789")
    .action(async (options) => {
      await ensureGatewayRunning(options.host, options.port);

      const client = new GatewayClient(options.host || "127.0.0.1", options.port ? parseInt(options.port, 10) : 18789);
      await client.connect();

      try {
        const response = await client.call("activities.range", {});

        if (shouldOutputJson(options)) {
          outputJson(response, options);
        } else {
          if (response.range) {
            const fromDate = new Date(response.range.from).toISOString();
            const toDate = new Date(response.range.to).toISOString();
            console.log(`Available date range:`);
            console.log(`  From: ${fromDate}`);
            console.log(`  To: ${toDate}`);
          } else {
            console.log("No activities found");
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        if (shouldOutputJson(options)) {
          outputJson({ error: errorMessage }, options);
        } else {
          console.error(`Error: ${errorMessage}`);
        }
        process.exit(1);
      } finally {
        await client.disconnect();
      }
    });

  return cmd;
}
