const { EventEmitter } = require("node:events");
const { PassThrough, Writable } = require("node:stream");
const { MESSAGE } = require("./instance-host.cjs");
const { randomUUID } = require("node:crypto");

const INSTANCE_HOST = Symbol.for("elementspanel.instance-process-host");

/** A ChildProcess-shaped proxy, backed by pipes owned by the CLI. */
function installInstanceProcessClient() {
  const children = new Map();
  const requests = new Map();
  let nextRequest = 0;
  const send = (message, callback = () => {}) => {
    if (!process.connected) return callback(new Error("The instance process host disconnected."));
    process.send({ type: MESSAGE, ...message }, callback);
  };
  class InstanceChild extends EventEmitter {
    constructor(id, snapshot) {
      super();
      this.id = id;
      this.token = randomUUID();
      this.pid = snapshot?.pid;
      this.metadata = snapshot?.metadata || {};
      this.exitCode = snapshot?.exitCode ?? null;
      this.signalCode = snapshot?.signalCode ?? null;
      this.stdout = new PassThrough();
      this.stderr = new PassThrough();
      this.stdin = new Writable({
        write: (data, _encoding, callback) => this.send("write", data, callback)
      });
      children.set(id, this);
    }
    kill(signal) {
      this.send("kill", signal);
      return process.connected;
    }
    setMetadata(metadata) {
      Object.assign(this.metadata, metadata);
      this.send("metadata", metadata);
    }
    release() {
      if (children.get(this.id) !== this) return;
      children.delete(this.id);
      this.send("release");
    }
    send(op, data, callback) {
      send({ id: this.id, token: this.token, op, data }, callback);
    }
  }
  process.on("message", (message) => {
    if (message?.type !== MESSAGE) return;
    if (message.requestId) {
      const request = requests.get(message.requestId);
      requests.delete(message.requestId);
      if (message.error) request?.reject(new Error(message.error));
      else request?.resolve(message.data);
      return;
    }
    const child = children.get(message.id);
    if (!child || child.token !== message.token) return;
    const { event, data } = message;
    if (event === "stdout" || event === "stderr") child[event].write(data);
    else if (event === "spawn") {
      child.pid = data;
      child.emit("spawn");
    } else if (event === "error") {
      if (child.listenerCount("error")) child.emit("error", new Error(data));
    } else if (event === "close") {
      [child.exitCode, child.signalCode] = data;
      child.stdout.end();
      child.stderr.end();
      child.emit("exit", ...data);
      child.emit("close", ...data);
    }
  });
  process.on("disconnect", () => {
    for (const request of requests.values())
      request.reject(new Error("Instance host disconnected."));
    requests.clear();
  });
  const api = {
    spawn(id, file, args, options, metadata) {
      if (children.has(id)) throw new Error("This instance already has a process.");
      const child = new InstanceChild(id);
      child.metadata = metadata;
      child.send("spawn", { file, args, options, metadata }, (error) => {
        if (error) child.emit("error", error);
      });
      return child;
    },
    list() {
      return new Promise((resolve, reject) => {
        const requestId = ++nextRequest;
        requests.set(requestId, { resolve, reject });
        send({ op: "list", requestId }, (error) => {
          if (!error) return;
          requests.delete(requestId);
          reject(error);
        });
      });
    },
    connect(snapshot) {
      const child = new InstanceChild(snapshot.id, snapshot);
      // The caller installs data/exit listeners synchronously before the replay.
      child.send("attach");
      return child;
    }
  };
  globalThis[INSTANCE_HOST] = api;
  return api;
}

module.exports = { installInstanceProcessClient };
