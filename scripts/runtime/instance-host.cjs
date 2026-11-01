const { spawn, execFileSync } = require("node:child_process");

const MESSAGE = "elementspanel:instance";
const MAX_OUTPUT = 1024 * 1024;

/** Own stdin/stdout and child handles outside the replaceable daemon worker. */
class InstanceProcessHost {
  constructor() {
    this.records = new Map();
  }

  send(client, message) {
    if (client?.connected) client.send({ type: MESSAGE, ...message }, () => {});
  }

  publish(record, event, data) {
    record.pending.push({ event, data });
    if (Buffer.isBuffer(data)) record.bytes += data.length;
    // Always drain the real pipes while the daemon is absent, with bounded
    // replay storage so a verbose server cannot block or exhaust the launcher.
    if (record.client?.connected && record.bytes > MAX_OUTPUT) {
      record.child.stdout.pause();
      record.child.stderr.pause();
    }
    while (!record.client?.connected && record.bytes > MAX_OUTPUT) {
      const index = record.pending.findIndex((item) => Buffer.isBuffer(item.data));
      if (index < 0) break;
      const item = record.pending[index];
      const excess = record.bytes - MAX_OUTPUT;
      if (item.data.length > excess) {
        item.data = item.data.subarray(excess);
        record.bytes -= excess;
      } else {
        record.bytes -= item.data.length;
        record.pending.splice(index, 1);
      }
    }
    this.flush(record);
  }

  flush(record) {
    if (record.sending || !record.client?.connected || !record.pending.length) return;
    if (record.bytes < MAX_OUTPUT / 2) {
      record.child.stdout.resume();
      record.child.stderr.resume();
    }
    const client = record.client;
    const item = record.pending.shift();
    if (Buffer.isBuffer(item.data)) record.bytes -= item.data.length;
    record.sending = true;
    client.send({ type: MESSAGE, id: record.id, token: record.token, ...item }, (error) => {
      record.sending = false;
      if (error && record.client === client) record.client = undefined;
      this.flush(record);
    });
  }

  detach(client, preserving = false) {
    for (const record of this.records.values()) {
      if (record.client !== client) continue;
      record.client = undefined;
      record.preserving = preserving;
      record.child.stdout.resume();
      record.child.stderr.resume();
    }
  }

  snapshot(record) {
    return {
      id: record.id,
      pid: record.child.pid,
      metadata: record.metadata,
      exitCode: record.child.exitCode,
      signalCode: record.child.signalCode
    };
  }

  handle(client, message) {
    if (message?.type !== MESSAGE) return;
    const { id, token, op, data, requestId } = message;
    const reply = (value, error) => this.send(client, { requestId, data: value, error });
    if (op === "list") return reply([...this.records.values()].map((item) => this.snapshot(item)));
    if (op === "spawn") {
      if (this.records.has(id)) {
        this.send(client, {
          id,
          token,
          event: "error",
          data: "This instance already has a process."
        });
        this.send(client, { id, token, event: "close", data: [1, null] });
        return;
      }
      let child;
      try {
        child = spawn(data.file, data.args, {
          ...data.options,
          stdio: "pipe",
          windowsHide: true,
          detached: false
        });
      } catch (error) {
        this.send(client, { id, token, event: "error", data: error.message });
        this.send(client, { id, token, event: "close", data: [1, null] });
        return;
      }
      const record = { id, token, child, client, metadata: data.metadata, pending: [], bytes: 0 };
      this.records.set(id, record);
      child.once("spawn", () => this.publish(record, "spawn", child.pid));
      for (const name of ["stdout", "stderr"]) {
        child[name].on("data", (chunk) => this.publish(record, name, chunk));
        child[name].on("error", (error) => this.publish(record, "error", error.message));
      }
      child.stdin.on("error", (error) => this.publish(record, "error", error.message));
      child.on("error", (error) => this.publish(record, "error", error.message));
      child.once("close", (code, signal) => {
        record.closed = true;
        this.publish(record, "close", [code, signal]);
        if (record.released) this.records.delete(id);
      });
      return;
    }
    const record = this.records.get(id);
    if (!record) return;
    if (op !== "attach" && token !== record.token) return;
    if (op === "attach") {
      record.token = token;
      record.client = client;
      record.preserving = false;
      if (record.closed && !record.pending.some((item) => item.event === "close"))
        record.pending.push({
          event: "close",
          data: [record.child.exitCode, record.child.signalCode]
        });
      this.flush(record);
    } else if (op === "metadata") {
      // Keep the stop intent associated with a completed process, even if the
      // old instance has already reset its state while preparing to exit.
      if (record.closed) delete data.userRequestedStop;
      Object.assign(record.metadata, data);
    } else if (op === "write") {
      if (!record.child.stdin.destroyed) record.child.stdin.write(data);
    } else if (op === "kill") {
      record.child.kill(data || "SIGTERM");
    } else if (op === "release") {
      if (record.preserving) return;
      record.released = true;
      if (record.closed) this.records.delete(id);
    }
  }

  stop() {
    for (const { child, metadata } of this.records.values()) {
      if (child.exitCode !== null || child.signalCode !== null || !child.pid) continue;
      try {
        if (process.platform === "win32") {
          execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true });
        } else {
          if (metadata.pid && metadata.pid !== child.pid) {
            try {
              process.kill(metadata.pid, "SIGKILL");
            } catch {}
          }
          child.kill("SIGKILL");
        }
      } catch {}
    }
    this.records.clear();
  }
}

module.exports = { InstanceProcessHost, MESSAGE };
