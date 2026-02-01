import fs from "node:fs/promises";
import path from "node:path";
import { glob as globFn } from "glob";
import type { SecurityContext } from "@server/world/execution/security/types.js";
import { isToolAllowed } from "@server/world/execution/security/policy/tool-policy.js";
import type { Tool, ToolDefinition, ToolResult } from "../terminal/index.js";

// Truncation limits (matching OpenCode's approach)
const DEFAULT_READ_LIMIT = 2000; // lines
const MAX_LINE_LENGTH = 2000; // characters per line
const MAX_BYTES = 50 * 1024; // 50KB

export function createFilesystemTool(): Tool {
  return {
    definition: {
      name: "filesystem",
      description: "Perform file system operations: list directories, read files, write files, search for files using glob patterns, and get file statistics. IMPORTANT: For large files, first use 'file_stats' to check size, then use 'read_file' with offset/limit to read specific sections. By default, reads up to 2000 lines or 50KB, whichever comes first.",
      parameters: {
        type: "object",
        properties: {
          operation: {
            type: "string",
            description: "The operation to perform: 'list_dir', 'read_file', 'write_file', 'glob', or 'file_stats'",
            enum: ["list_dir", "read_file", "write_file", "glob", "file_stats"],
          },
          path: {
            type: "string",
            description: "File or directory path (required for list_dir, read_file, write_file)",
          },
          pattern: {
            type: "string",
            description: "Glob pattern for searching files (required for glob operation)",
          },
          content: {
            type: "string",
            description: "Content to write to file (required for write_file operation)",
          },
          encoding: {
            type: "string",
            description: "File encoding (default: 'utf8' for text, 'base64' for binary)",
            enum: ["utf8", "base64"],
          },
          offset: {
            type: "number",
            description: "Line number to start reading from (0-based, for read_file operation). Use this with limit to read large files in chunks.",
          },
          limit: {
            type: "number",
            description: `Number of lines to read (default: ${DEFAULT_READ_LIMIT}, max: ${DEFAULT_READ_LIMIT}). Use with offset to read large files in chunks.`,
          },
        },
        required: ["operation"],
      },
    },
    handler: async (params, securityContext, executionContext) => {
      try {
        const { operation, path: filePath, pattern, content, encoding = "utf8" } = params;

        if (typeof operation !== "string") {
          return {
            success: false,
            error: "operation must be a string",
          };
        }

        // Check tool security
        if (securityContext) {
          const toolAllowed = isToolAllowed("filesystem", securityContext.toolPolicy);
          if (!toolAllowed) {
            return {
              success: false,
              error: "Filesystem tool is not allowed by security policy",
            };
          }
        }

        switch (operation) {
          case "list_dir": {
            if (!filePath || typeof filePath !== "string") {
              return {
                success: false,
                error: "path is required for list_dir operation",
              };
            }

            try {
              const resolvedPath = filePath.startsWith("~")
                ? filePath.replace("~", process.env.HOME || "")
                : path.resolve(filePath);

              const entries = await fs.readdir(resolvedPath, { withFileTypes: true });
              const result = entries.map((entry) => ({
                name: entry.name,
                type: entry.isDirectory() ? "directory" : "file",
                path: path.join(resolvedPath, entry.name),
              }));

              return {
                success: true,
                result: {
                  path: resolvedPath,
                  entries: result,
                },
              };
            } catch (err) {
              return {
                success: false,
                error: err instanceof Error ? err.message : "Failed to list directory",
              };
            }
          }

          case "file_stats": {
            if (!filePath || typeof filePath !== "string") {
              return {
                success: false,
                error: "path is required for file_stats operation",
              };
            }

            try {
              const resolvedPath = filePath.startsWith("~")
                ? filePath.replace("~", process.env.HOME || "")
                : path.resolve(filePath);

              const stats = await fs.stat(resolvedPath);
              
              if (!stats.isFile()) {
                return {
                  success: false,
                  error: `Path is not a file: ${resolvedPath}`,
                };
              }

              // Count lines for text files
              let lineCount: number | null = null;
              try {
                const buffer = await fs.readFile(resolvedPath);
                const text = buffer.toString("utf8");
                lineCount = text.split("\n").length;
              } catch {
                // If we can't read as text, that's okay - it's probably binary
              }

              return {
                success: true,
                result: {
                  path: resolvedPath,
                  size: stats.size,
                  sizeKB: Math.round(stats.size / 1024),
                  sizeMB: Math.round((stats.size / 1024 / 1024) * 100) / 100,
                  lines: lineCount,
                  isLarge: stats.size > MAX_BYTES || (lineCount !== null && lineCount > DEFAULT_READ_LIMIT),
                  recommendation: stats.size > MAX_BYTES || (lineCount !== null && lineCount > DEFAULT_READ_LIMIT)
                    ? `File is large (${lineCount !== null ? `${lineCount} lines, ` : ""}${Math.round(stats.size / 1024)}KB). Use read_file with offset/limit parameters to read specific sections, or use grep tool to search for specific content first.`
                    : "File size is manageable, you can read it directly.",
                },
              };
            } catch (err) {
              return {
                success: false,
                error: err instanceof Error ? err.message : "Failed to get file stats",
              };
            }
          }

          case "read_file": {
            if (!filePath || typeof filePath !== "string") {
              return {
                success: false,
                error: "path is required for read_file operation",
              };
            }

            try {
              const resolvedPath = filePath.startsWith("~")
                ? filePath.replace("~", process.env.HOME || "")
                : path.resolve(filePath);

              // Check file size first
              const stats = await fs.stat(resolvedPath);
              const isLarge = stats.size > MAX_BYTES;
              
              const buffer = await fs.readFile(resolvedPath);
              
              // Handle binary/base64 encoding
              if (encoding === "base64") {
                return {
                  success: true,
                  result: {
                    path: resolvedPath,
                    content: buffer.toString("base64"),
                    encoding: "base64",
                    size: buffer.length,
                  },
                };
              }

              // For text files, apply truncation and pagination
              const fullText = buffer.toString("utf8");
              const allLines = fullText.split("\n");
              const totalLines = allLines.length;
              
              // Warn if file is very large and no offset specified
              if (isLarge && typeof params.offset !== "number") {
                const warning = `⚠️ Large file detected (${totalLines} lines, ${Math.round(stats.size / 1024)}KB). Reading first ${DEFAULT_READ_LIMIT} lines. Use offset/limit to read specific sections, or use grep tool to search for content first.`;
                // We'll prepend this to the output
              }
              
              // Parse pagination parameters
              const offset = typeof params.offset === "number" ? Math.max(0, params.offset) : 0;
              const limit = typeof params.limit === "number" 
                ? Math.min(Math.max(1, params.limit), DEFAULT_READ_LIMIT)
                : DEFAULT_READ_LIMIT;
              
              // Read lines with truncation
              const readLines: string[] = [];
              let bytes = 0;
              let truncatedByBytes = false;
              let truncatedByLineLength = false;
              
              for (let i = offset; i < Math.min(totalLines, offset + limit); i++) {
                let line = allLines[i];
                
                // Truncate lines longer than MAX_LINE_LENGTH
                if (line.length > MAX_LINE_LENGTH) {
                  line = line.substring(0, MAX_LINE_LENGTH) + "...";
                  truncatedByLineLength = true;
                }
                
                const lineSize = Buffer.byteLength(line, "utf-8") + (readLines.length > 0 ? 1 : 0); // +1 for newline
                
                if (bytes + lineSize > MAX_BYTES) {
                  truncatedByBytes = true;
                  break;
                }
                
                readLines.push(line);
                bytes += lineSize;
              }
              
              // Format output with line numbers (1-based, matching OpenCode)
              const formattedLines = readLines.map((line, index) => {
                const lineNum = (offset + index + 1).toString().padStart(5, "0");
                return `${lineNum}| ${line}`;
              });
              
              const content = `<file>\n${formattedLines.join("\n")}`;
              
              // Build status message
              const lastReadLine = offset + readLines.length;
              const hasMoreLines = totalLines > lastReadLine;
              const truncated = hasMoreLines || truncatedByBytes;
              
              let statusMessage = "";
              if (truncatedByBytes) {
                statusMessage = `\n\n(Output truncated at ${MAX_BYTES} bytes. Use 'offset' parameter to read beyond line ${lastReadLine})`;
              } else if (hasMoreLines) {
                statusMessage = `\n\n(File has ${totalLines} total lines, showing lines ${offset + 1}-${lastReadLine}. Use 'offset' parameter to read beyond line ${lastReadLine})`;
              } else {
                statusMessage = `\n\n(End of file - total ${totalLines} lines)`;
              }
              
              if (truncatedByLineLength) {
                statusMessage += `\n(Some lines were truncated to ${MAX_LINE_LENGTH} characters)`;
              }
              
              // Add warning for large files
              let warningPrefix = "";
              if (isLarge && typeof params.offset !== "number") {
                warningPrefix = `⚠️ Large file (${totalLines} lines, ${Math.round(stats.size / 1024)}KB). Showing first ${readLines.length} lines.\n\n`;
              }
              
              const finalContent = warningPrefix + content + statusMessage + "\n</file>";
              
              return {
                success: true,
                result: {
                  path: resolvedPath,
                  content: finalContent,
                  encoding: "utf8",
                  size: buffer.length,
                  linesRead: readLines.length,
                  totalLines,
                  offset,
                  truncated,
                  hasMore: hasMoreLines,
                },
              };
            } catch (err) {
              return {
                success: false,
                error: err instanceof Error ? err.message : "Failed to read file",
              };
            }
          }

          case "write_file": {
            if (!filePath || typeof filePath !== "string") {
              return {
                success: false,
                error: "path is required for write_file operation",
              };
            }

            if (content === undefined || typeof content !== "string") {
              return {
                success: false,
                error: "content is required for write_file operation",
              };
            }

            try {
              const resolvedPath = filePath.startsWith("~")
                ? filePath.replace("~", process.env.HOME || "")
                : path.resolve(filePath);

              // Ensure directory exists
              const dir = path.dirname(resolvedPath);
              await fs.mkdir(dir, { recursive: true });

              let buffer: Buffer;
              if (encoding === "base64") {
                buffer = Buffer.from(content, "base64");
              } else {
                buffer = Buffer.from(content, "utf8");
              }

              await fs.writeFile(resolvedPath, buffer);

              return {
                success: true,
                result: {
                  path: resolvedPath,
                  size: buffer.length,
                },
              };
            } catch (err) {
              return {
                success: false,
                error: err instanceof Error ? err.message : "Failed to write file",
              };
            }
          }

          case "glob": {
            if (!pattern || typeof pattern !== "string") {
              return {
                success: false,
                error: "pattern is required for glob operation",
              };
            }

            try {
              const matches = await globFn(pattern, {
                absolute: true,
                ignore: ["node_modules/**", ".git/**"],
              });

              return {
                success: true,
                result: {
                  pattern,
                  matches,
                  count: matches.length,
                },
              };
            } catch (err) {
              return {
                success: false,
                error: err instanceof Error ? err.message : "Failed to search files",
              };
            }
          }

          default:
            return {
              success: false,
              error: `Unknown operation: ${operation}. Supported operations: list_dir, read_file, write_file, glob`,
            };
        }
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "Unknown error",
        };
      }
    },
  };
}
