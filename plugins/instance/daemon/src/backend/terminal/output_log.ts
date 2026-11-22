import { open } from "node:fs/promises";
import { TerminalSettings, TERMINAL_SETTINGS_LIMITS } from "../../../../shared/terminal_settings";

/** Read only the byte-limited suffix of an instance log. */
export async function readOutputLogTail(filename: string, size: unknown) {
  const limit = size ?? new TerminalSettings().historyLimitKB * 1024;
  if (
    typeof limit !== "number" ||
    !Number.isInteger(limit) ||
    limit < 0 ||
    limit > TERMINAL_SETTINGS_LIMITS.historyLimitKB.max * 1024
  )
    throw new Error("Invalid terminal log size.");
  if (limit === 0) return "";

  const file = await open(filename, "r");
  try {
    const stat = await file.stat();
    const buffer = Buffer.alloc(Math.min(stat.size, limit));
    const position = stat.size - buffer.length;
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await file.read(
        buffer,
        length,
        buffer.length - length,
        position + length
      );
      if (bytesRead === 0) break;
      length += bytesRead;
    }
    let start = 0;
    // A byte limit can begin in the middle of a UTF-8 character.
    if (position > 0) while (start < length && (buffer[start] & 0xc0) === 0x80) start++;
    return buffer.subarray(start, length).toString("utf8");
  } finally {
    await file.close();
  }
}
