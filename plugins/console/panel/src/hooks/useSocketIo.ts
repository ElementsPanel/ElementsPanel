import { mapDaemonAddress, parseForwardAddress } from "@/tools/protocol";
import { removeTrail } from "@/tools/string";
import type { DefaultEventsMap } from "@socket.io/component-emitter";
import type { Socket } from "socket.io-client";
import { io } from "socket.io-client";
import { onScopeDispose, ref } from "vue";
import type { ComputedNodeInfo } from "./useOverviewInfo";

// eslint-disable-next-line no-unused-vars
export enum SocketStatus {
  // eslint-disable-next-line no-unused-vars
  Connected = 1,
  // eslint-disable-next-line no-unused-vars
  Connecting = 2,
  // eslint-disable-next-line no-unused-vars
  Error = 0
}

export function makeSocketIo(addr: string, prefix?: string) {
  prefix = removeTrail((prefix ?? "").trim(), "/");
  return io(parseForwardAddress(addr, "ws"), {
    path: prefix + "/socket.io",
    multiplex: false,
    reconnectionDelayMax: 1000 * 10,
    timeout: 1000 * 30,
    reconnection: true,
    reconnectionAttempts: 3,
    rejectUnauthorized: false
  });
}

export function testSocketConnection(addr: string, prefix?: string, signal?: AbortSignal) {
  return new Promise<Socket<DefaultEventsMap, DefaultEventsMap>>((resolve, reject) => {
    if (signal?.aborted) return reject(new Error("Socket connection test cancelled"));
    const socket = makeSocketIo(addr, prefix);
    const cleanup = () => {
      socket.off("connect", connected);
      socket.off("connect_error", failed);
      signal?.removeEventListener("abort", cancelled);
      socket.disconnect();
    };
    const connected = () => {
      cleanup();
      resolve(socket);
    };
    const failed = (error: Error) => {
      cleanup();
      reject(error);
    };
    const cancelled = () => failed(new Error("Socket connection test cancelled"));
    socket.once("connect", connected);
    socket.once("connect_error", failed);
    signal?.addEventListener("abort", cancelled, { once: true });
  });
}

export function useSocketIoClient() {
  let controller: AbortController | undefined;
  const socketStatus = ref<SocketStatus>(SocketStatus.Connecting);

  onScopeDispose(() => controller?.abort());

  const testFrontendSocket = async (remoteNode?: Partial<ComputedNodeInfo>) => {
    controller?.abort();
    const current = (controller = new AbortController());
    const nodeCfg = remoteNode;

    if (!nodeCfg?.available || !nodeCfg.ip) {
      socketStatus.value = SocketStatus.Error;
    } else {
      try {
        socketStatus.value = SocketStatus.Connecting;
        let addr = `${nodeCfg.ip}:${nodeCfg.port}`,
          prefix = nodeCfg.prefix;
        if (nodeCfg.remoteMappings) {
          const mapped = mapDaemonAddress(
            nodeCfg.remoteMappings.map((entry) => ({
              from: {
                addr: `${entry.from.ip}:${entry.from.port}`,
                prefix: entry.from.prefix
              },
              to: {
                addr: `${entry.to.ip}:${entry.to.port}`,
                prefix: entry.to.prefix
              }
            }))
          );
          if (mapped) {
            addr = mapped.addr;
            prefix = mapped.prefix;
          }
        }
        await testSocketConnection(addr, prefix, current.signal);
        if (!current.signal.aborted) socketStatus.value = SocketStatus.Connected;
      } catch (error) {
        if (current.signal.aborted) return;
        console.error("Socket error: ", error);
        socketStatus.value = SocketStatus.Error;
      }
    }
  };

  const testConnect = (addr: string, prefix?: string) => {
    controller?.abort();
    controller = new AbortController();
    return testSocketConnection(addr, prefix, controller.signal);
  };

  return { testConnect, testFrontendSocket, socketStatus };
}
