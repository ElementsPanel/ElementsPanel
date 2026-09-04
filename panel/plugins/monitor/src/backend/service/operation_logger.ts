import { v4 } from "uuid";
import type { OperationLoggerItem, OperationLoggerItemPayload } from "../../../../../src/types/operation_logger";
import { JsonlStorage } from "./jsonl_storage";

type CleanPayload<T extends keyof OperationLoggerItemPayload> = Omit<
  OperationLoggerItemPayload[T],
  "operation_id" | "operation_time" | "operation_level"
>;

export class OperationLogger {
  #storage = new JsonlStorage("operation_logs");
  #buffer = new Map<string, OperationLoggerItem>();
  #bufferSize: number;
  #flushTimer: NodeJS.Timeout | null = null;

  constructor(bufferSize = 20) {
    this.#bufferSize = bufferSize;
    this.#flushTimer = setInterval(() => this.flush(), 5000);
  }

  private async flushBuffer(buffer: Map<string, OperationLoggerItem>) {
    if (buffer.size === 0) return;
    await this.#storage.append("global", Array.from(buffer.values()));
  }

  private flush() {
    if (this.#buffer.size === 0) return;
    const buffer = this.#buffer;
    this.#buffer = new Map();
    void this.flushBuffer(buffer);
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
    if (this.#buffer.size >= this.#bufferSize) this.flush();
    return item.operation_id;
  }

  async get(limit = 20) {
    if (limit <= this.#buffer.size) return Array.from(this.#buffer.values()).slice(-limit);
    this.flush();
    return this.#storage.tail<OperationLoggerItem>("global", limit);
  }

  async getByInstance(instanceId: string, daemonId: string, limit = 50) {
    this.flush();
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
    if (this.#buffer.size === 0) return;
    const buffer = this.#buffer;
    this.#buffer = new Map();
    this.#storage.append("global", Array.from(buffer.values()), true);
  }
}
