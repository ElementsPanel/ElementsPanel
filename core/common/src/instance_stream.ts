// Only the transport operations used by forwarding belong in this shared API.
// Keep the concrete socket type local to each consumer's Socket.IO installation.
export interface ForwardSocket {
  id: string;
  connected: boolean;
  once(event: "disconnect", listener: () => void): unknown;
  off(event: "disconnect", listener: () => void): unknown;
  emit(event: string, data: any): unknown;
}

// Application instance data stream forwarding adapter
export default class InstanceStreamListener<S extends ForwardSocket = ForwardSocket> {
  public readonly listenMap = new Map<string, S[]>();
  private readonly disconnectHandlers = new Map<S, () => void>();

  public requestForward(socket: S, instanceUuid: string) {
    const sockets = this.listenMap.get(instanceUuid) ?? [];
    if (sockets.some((listener) => listener.id === socket.id)) return;
    sockets.push(socket);
    this.listenMap.set(instanceUuid, sockets);
    if (!this.disconnectHandlers.has(socket)) {
      const disconnect = () => {
        for (const uuid of this.listenMap.keys()) this.cannelForward(socket, uuid);
      };
      this.disconnectHandlers.set(socket, disconnect);
      socket.once("disconnect", disconnect);
    }
  }

  public cannelForward(socket: S, instanceUuid: string) {
    const remaining = this.listenMap
      .get(instanceUuid)
      ?.filter((listener) => listener.id !== socket.id);
    if (remaining?.length) this.listenMap.set(instanceUuid, remaining);
    else this.listenMap.delete(instanceUuid);
    if (![...this.listenMap.values()].some((sockets) => sockets.includes(socket))) {
      const disconnect = this.disconnectHandlers.get(socket);
      if (disconnect) socket.off("disconnect", disconnect);
      this.disconnectHandlers.delete(socket);
    }
  }

  public forward(instanceUuid: string, data: any) {
    this.forwardViaCallback(instanceUuid, (socket) => socket.emit("instance/stdout", data));
  }

  public forwardViaCallback(instanceUuid: string, callback: (socket: S) => void) {
    for (const socket of this.listenMap.get(instanceUuid) ?? []) {
      if (socket.connected) callback(socket);
      else this.cannelForward(socket, instanceUuid);
    }
  }

  public hasListenInstance(instanceUuid: string) {
    return this.listenMap.get(instanceUuid)?.some((socket) => socket.connected) ?? false;
  }
}
