import { constants } from "node:fs";
import { open } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";

/** Keep a byte-limited suffix without starting inside a UTF-8 character. */
export function logTail(buffer: Buffer, limit: number): Buffer {
  let start = Math.max(0, buffer.length - limit);
  while (start < buffer.length && (buffer[start] & 0xc0) === 0x80) start++;
  return buffer.subarray(start);
}

async function writeAll(file: FileHandle, data: Buffer, position: number) {
  let written = 0;
  while (written < data.length) {
    const { bytesWritten } = await file.write(
      data,
      written,
      data.length - written,
      position + written
    );
    if (!bytesWritten) break;
    written += bytesWritten;
  }
}

/** Caller serializes writes for a given instance. Compaction leaves room for subsequent output. */
export async function appendInstanceLog(filename: string, text: string, maxBytes: number) {
  if (!maxBytes || !text) return;
  const incoming = logTail(Buffer.from(text, "utf8"), maxBytes);
  // Use O_RDWR | O_CREAT instead of "a+": Windows rejects ftruncate() on O_APPEND handles.
  const file = await open(filename, constants.O_RDWR | constants.O_CREAT);
  try {
    const { size } = await file.stat();
    if (size + incoming.length > maxBytes) {
      const retain = Math.min(size, maxBytes - incoming.length, Math.floor(maxBytes * 0.75));
      const tail = Buffer.alloc(retain);
      let read = 0;
      while (read < retain) {
        const { bytesRead } = await file.read(tail, read, retain - read, size - retain + read);
        if (!bytesRead) break;
        read += bytesRead;
      }
      const kept = logTail(tail.subarray(0, read), read);
      await file.truncate(0);
      await writeAll(file, Buffer.concat([kept, incoming]), 0);
    } else {
      await writeAll(file, incoming, size);
    }
  } finally {
    await file.close();
  }
}
