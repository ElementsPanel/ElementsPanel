import { Socket } from "socket.io";

// Application instance data stream forwarding adapter
export default class InstanceStreamListener {
  public readonly listenMap = new Map<string, Socket[]>();
  private readonly disconnectHandlers = new Map<Socket, () => void>();

  public requestForward(socket: Socket, instanceUuid: string) {
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

  public cannelForward(socket: Socket, instanceUuid: string) {
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

  public forwardViaCallback(instanceUuid: string, callback: (socket: Socket) => void) {
    for (const socket of this.listenMap.get(instanceUuid) ?? []) {
      if (socket.connected) callback(socket);
      else this.cannelForward(socket, instanceUuid);
    }
  }

  public hasListenInstance(instanceUuid: string) {
    return this.listenMap.get(instanceUuid)?.some((socket) => socket.connected) ?? false;
  }
}
