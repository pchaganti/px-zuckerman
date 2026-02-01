/**
 * Truncation limits matching OpenCode's approach
 */
export const TRUNCATE_MAX_LINES = 2000;
export const TRUNCATE_MAX_BYTES = 50 * 1024; // 50KB

export interface TruncateResult {
  content: string;
  truncated: boolean;
}

export interface TruncateOptions {
  maxLines?: number;
  maxBytes?: number;
  direction?: "head" | "tail";
}

/**
 * Truncate tool output to fit within token limits
 * Saves full content to a file if truncated
 */
export async function truncateOutput(
  text: string,
  options: TruncateOptions = {},
): Promise<TruncateResult> {
  const maxLines = options.maxLines ?? TRUNCATE_MAX_LINES;
  const maxBytes = options.maxBytes ?? TRUNCATE_MAX_BYTES;
  const direction = options.direction ?? "head";
  
  const lines = text.split("\n");
  const totalBytes = Buffer.byteLength(text, "utf-8");

  // Check if truncation is needed
  if (lines.length <= maxLines && totalBytes <= maxBytes) {
    return { content: text, truncated: false };
  }

  // Truncate content
  const out: string[] = [];
  let i = 0;
  let bytes = 0;
  let hitBytes = false;

  if (direction === "head") {
    for (i = 0; i < lines.length && i < maxLines; i++) {
      const size = Buffer.byteLength(lines[i], "utf-8") + (i > 0 ? 1 : 0); // +1 for newline
      if (bytes + size > maxBytes) {
        hitBytes = true;
        break;
      }
      out.push(lines[i]);
      bytes += size;
    }
  } else {
    // tail direction
    for (i = lines.length - 1; i >= 0 && out.length < maxLines; i--) {
      const size = Buffer.byteLength(lines[i], "utf-8") + (out.length > 0 ? 1 : 0);
      if (bytes + size > maxBytes) {
        hitBytes = true;
        break;
      }
      out.unshift(lines[i]);
      bytes += size;
    }
  }

  const removed = hitBytes ? totalBytes - bytes : lines.length - out.length;
  const unit = hitBytes ? "bytes" : "lines";
  const preview = out.join("\n");

  // Provide actionable hints instead of saving to disk
  const hint = `⚠️ Output truncated (${removed} ${unit} removed) to fit within context limits.\n\nTo access more content:\n- Use grep tool to search for specific patterns\n- Use filesystem read_file with offset/limit parameters to read specific sections\n- For file operations, check file size first with file_stats operation`;
  
  const message =
    direction === "head"
      ? `${preview}\n\n...${removed} ${unit} truncated...\n\n${hint}`
      : `...${removed} ${unit} truncated...\n\n${hint}\n\n${preview}`;

  return { content: message, truncated: true };
}

