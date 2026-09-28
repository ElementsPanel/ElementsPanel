import { v4 } from "uuid";
import type {
  OperationLoggerItem,
  OperationLoggerItemPayload
} from "../../../../../src/types/operation_logger";
import { JsonlStorage } from "./jsonl_storage";

type CleanPayload<T extends keyof OperationLoggerItemPayload> = Omit<
  OperationLoggerItemPayload[T],
  "operation_id" | "operation_time" | "operation_level"
>;

export class OperationLogger {
  private static readonly MAX_BUFFER_SIZE = 200;
  #storage = new JsonlStorage("operation_logs");
  #buffer = new Map<string, OperationLoggerItem>();
  #bufferSize: number;
  #flushTimer: NodeJS.Timeout | null = null;
  #retryAfter = 0;

  constructor(bufferSize = 20) {
    if (!Number.isSafeInteger(bufferSize) || bufferSize < 1) {
      throw new RangeError("bufferSize must be a positive integer");
    }
    this.#bufferSize = Math.min(bufferSize, OperationLogger.MAX_BUFFER_SIZE);
    this.#flushTimer = setInterval(() => this.flush(), 5000);
    this.#flushTimer.unref();
  }

  private flush(): boolean {
    if (this.#buffer.size === 0) return true;
    // Histories are bounded. Commit them atomically before dropping the buffer,
    // so reads and shutdown cannot race an asynchronous append/trim operation.
    try {
      this.#storage.appendSync("global", Array.from(this.#buffer.values()));
      this.#buffer.clear();
      this.#retryAfter = 0;
      return true;
    } catch (error) {
      // Audit persistence must not turn an already completed business operation
      // into a failed request. Keep the bounded buffer and retry from the timer.
      if (Date.now() >= this.#retryAfter) console.error("Failed to persist operation logs:", error);
      this.#retryAfter = Date.now() + 5000;
      return false;
    }
  }

  log<T extends keyof OperationLoggerItemPayload>(
    type: T,
    payload: CleanPayload<T>,
    level: "info" | "warning" | "error" = "info"
  ) {
    const item = {
      type,
      operation_id: v4(),
      operation_time: Date.now().toString(),
      operation_level: level,
      ...payload
    } as unknown as OperationLoggerItem;
    this.#buffer.set(item.operation_id, item);
    while (this.#buffer.size > OperationLogger.MAX_BUFFER_SIZE) {
      const oldest = this.#buffer.keys().next().value;
      if (oldest === undefined) break;
      this.#buffer.delete(oldest);
    }
    if (this.#buffer.size >= this.#bufferSize && Date.now() >= this.#retryAfter) this.flush();
    return item.operation_id;
  }

  async get(limit = 20) {
    if (!Number.isSafeInteger(limit) || limit < 1) return [];
    if (limit <= this.#buffer.size) return Array.from(this.#buffer.values()).slice(-limit);
    if (!this.flush()) return Array.from(this.#buffer.values()).slice(-limit);
    return this.#storage.tail<OperationLoggerItem>("global", limit);
  }

  async getByInstance(instanceId: string, daemonId: string, limit = 50) {
    if (!Number.isSafeInteger(limit) || limit < 1) return [];
    if (!this.flush()) {
      return Array.from(this.#buffer.values())
        .filter((entry) =>
          "instance_id" in entry && "daemon_id" in entry &&
          entry.instance_id === instanceId && entry.daemon_id === daemonId
        )
        .slice(-limit);
    }
    const entries = await this.#storage.query(
      "global",
      (entry: any) => entry.instance_id === instanceId && entry.daemon_id === daemonId
    );
    return entries.slice(-limit) as OperationLoggerItem[];
  }

  info<T extends keyof OperationLoggerItemPayload>(type: T, payload: CleanPayload<T>) {
    return this.log(type, payload, "info");
  }

  warning<T extends keyof OperationLoggerItemPayload>(type: T, payload: CleanPayload<T>) {
    return this.log(type, payload, "warning");
  }

  error<T extends keyof OperationLoggerItemPayload>(type: T, payload: CleanPayload<T>) {
    return this.log(type, payload, "error");
  }

  dispose() {
    if (this.#flushTimer) clearInterval(this.#flushTimer);
    this.#flushTimer = null;
    this.flush();
  }
}
