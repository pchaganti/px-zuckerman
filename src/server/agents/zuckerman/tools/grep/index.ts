import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { SecurityContext } from "@server/world/execution/security/types.js";
import { isToolAllowed } from "@server/world/execution/security/policy/tool-policy.js";
import type { Tool, ToolDefinition, ToolResult, ToolExecutionContext } from "../terminal/index.js";
import path from "node:path";
import fs from "node:fs/promises";

const execAsync = promisify(exec);

const MAX_MATCHES = 100;
const MAX_LINE_LENGTH = 2000;

/**
 * Creates a grep tool for searching text patterns in files
 * 
 * This tool is essential for large files - search first, then read specific sections
 */
export function createGrepTool(): Tool {
  return {
    definition: {
      name: "grep",
      description: `Search for text patterns in files using regex. Returns matching lines with file paths and line numbers. Essential for large files - search first to find relevant sections, then read those specific areas. Returns up to ${MAX_MATCHES} matches.`,
      parameters: {
        type: "object",
        properties: {
          pattern: {
            type: "string",
            description: "Regex pattern to search for (e.g., 'function.*test', 'class\\s+\\w+', 'TODO|FIXME')",
          },
          path: {
            type: "string",
            description: "Directory or file path to search in. Defaults to current working directory. Can be a specific file or directory.",
          },
          include: {
            type: "string",
            description: "File pattern to include (e.g., '*.ts', '*.{ts,tsx}', '*.js')",
          },
          exclude: {
            type: "string",
            description: "File pattern to exclude (e.g., 'node_modules', '*.min.js')",
          },
          caseSensitive: {
            type: "boolean",
            description: "Case-sensitive search (default: false)",
          },
          maxMatches: {
            type: "number",
            description: `Maximum number of matches to return (default: ${MAX_MATCHES}, max: ${MAX_MATCHES})`,
          },
        },
        required: ["pattern"],
      },
    },
    handler: async (params, securityContext, executionContext) => {
      try {
        const pattern = typeof params.pattern === "string" ? params.pattern : "";
        const searchPath = typeof params.path === "string" ? params.path : undefined;
        const include = typeof params.include === "string" ? params.include : undefined;
        const exclude = typeof params.exclude === "string" ? params.exclude : undefined;
        const caseSensitive = typeof params.caseSensitive === "boolean" ? params.caseSensitive : false;
        const maxMatches = typeof params.maxMatches === "number" ? Math.min(params.maxMatches, MAX_MATCHES) : MAX_MATCHES;

        if (!pattern || !pattern.trim()) {
          return {
            success: false,
            error: "pattern is required and must be a non-empty string",
          };
        }

        // Check tool security
        if (securityContext) {
          const toolAllowed = isToolAllowed("grep", securityContext.toolPolicy);
          if (!toolAllowed) {
            return {
              success: false,
              error: "Grep tool is not allowed by security policy",
            };
          }
        }

        // Resolve search path
        const resolvedPath = searchPath
          ? (searchPath.startsWith("~")
              ? searchPath.replace("~", process.env.HOME || "")
              : path.resolve(searchPath))
          : process.cwd();

        // Check if path exists
        try {
          const stats = await fs.stat(resolvedPath);
          const isFile = stats.isFile();
          const isDir = stats.isDirectory();
          
          if (!isFile && !isDir) {
            return {
              success: false,
              error: `Path is neither a file nor directory: ${resolvedPath}`,
            };
          }
        } catch (err) {
          return {
            success: false,
            error: `Path not found: ${resolvedPath}`,
          };
        }

        // Build grep command
        // Use ripgrep (rg) if available, otherwise fall back to grep
        let command: string;
        let useRipgrep = false;

        try {
          await execAsync("which rg");
          useRipgrep = true;
        } catch {
          // ripgrep not available, use grep
        }

        if (useRipgrep) {
          // Use ripgrep (faster, better)
          const args: string[] = [
            "-n", // line numbers
            "-H", // show filename
            "--hidden", // include hidden files
            "--no-messages", // suppress error messages
            "--field-match-separator=|", // use | as separator
            "--regexp",
            pattern,
          ];

          if (!caseSensitive) {
            args.push("-i");
          }

          if (include) {
            args.push("--glob", String(include));
          }

          if (exclude) {
            args.push("--glob", `!${String(exclude)}`);
          }

          args.push(resolvedPath);

          command = `rg ${args.join(" ")}`;
        } else {
          // Fall back to grep
          const args: string[] = [
            "-rn", // recursive, line numbers
            "-H", // show filename
          ];

          if (!caseSensitive) {
            args.push("-i");
          }

          if (include) {
            args.push("--include", String(include));
          }

          if (exclude) {
            args.push("--exclude", String(exclude));
          }

          args.push("-e", String(pattern), resolvedPath);

          command = `grep ${args.join(" ")}`;
        }

        // Execute grep
        const { stdout, stderr } = await execAsync(command, {
          maxBuffer: 10 * 1024 * 1024, // 10MB buffer
        });

        // Parse results
        const lines = stdout.trim().split("\n").filter((line) => line.trim());
        const matches: Array<{
          file: string;
          line: number;
          text: string;
        }> = [];

        const limit = Math.min(maxMatches, MAX_MATCHES);
        for (const line of lines.slice(0, limit)) {
          if (!line.trim()) continue;

          let file: string;
          let lineNumStr: string;
          let text: string;

          if (useRipgrep) {
            // ripgrep format: filepath|lineNum|text
            const parts = line.split("|");
            if (parts.length < 3) continue;
            file = parts[0];
            lineNumStr = parts[1];
            text = parts.slice(2).join("|");
          } else {
            // grep format: filepath:lineNum:text
            const colonIndex = line.indexOf(":");
            if (colonIndex === -1) continue;
            file = line.substring(0, colonIndex);
            const rest = line.substring(colonIndex + 1);
            const colonIndex2 = rest.indexOf(":");
            if (colonIndex2 === -1) continue;
            lineNumStr = rest.substring(0, colonIndex2);
            text = rest.substring(colonIndex2 + 1);
          }

          const lineNum = parseInt(lineNumStr, 10);
          if (isNaN(lineNum)) continue;

          // Truncate long lines
          if (text.length > MAX_LINE_LENGTH) {
            text = text.substring(0, MAX_LINE_LENGTH) + "...";
          }

          matches.push({
            file,
            line: lineNum,
            text: text.trim(),
          });
        }

        if (matches.length === 0) {
          return {
            success: true,
            result: {
              pattern,
              path: resolvedPath,
              matches: [],
              count: 0,
              message: `No matches found for pattern: ${pattern}`,
            },
          };
        }

        // Group by file for better organization
        const byFile: Record<string, Array<{ line: number; text: string }>> = {};
        for (const match of matches) {
          if (!byFile[match.file]) {
            byFile[match.file] = [];
          }
          byFile[match.file].push({
            line: match.line,
            text: match.text,
          });
        }

        // Format output
        let output = `Found ${matches.length} match${matches.length === 1 ? "" : "es"} for pattern: ${pattern}\n\n`;
        
        for (const [file, fileMatches] of Object.entries(byFile)) {
          output += `${file}:\n`;
          for (const match of fileMatches) {
            output += `  ${match.line}: ${match.text}\n`;
          }
          output += "\n";
        }

        if (lines.length > MAX_MATCHES) {
          output += `\n(Showing first ${MAX_MATCHES} matches. Total matches: ${lines.length})`;
        }

        return {
          success: true,
          result: {
            pattern,
            path: resolvedPath,
            matches,
            byFile,
            count: matches.length,
            totalFound: lines.length,
            truncated: lines.length > MAX_MATCHES,
            output,
          },
        };
      } catch (err: any) {
        // grep returns exit code 1 when no matches found - that's okay
        if (err.code === 1 && err.stdout) {
          const patternStr = typeof params.pattern === "string" ? params.pattern : String(params.pattern);
          return {
            success: true,
            result: {
              pattern: patternStr,
              matches: [],
              count: 0,
              message: `No matches found for pattern: ${patternStr}`,
            },
          };
        }

        return {
          success: false,
          error: err instanceof Error ? err.message : "Failed to execute grep",
        };
      }
    },
  };
}
