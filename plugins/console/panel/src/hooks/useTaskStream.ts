import { io, type Socket } from "socket.io-client";
import type { BackgroundTask } from "@/stores/useBackgroundTasks";

export interface TaskStreamUpdate {
  daemonId: string;
  nodeName: string;
  tasks: BackgroundTask[];
  unavailable: boolean;
}

export type TaskStreamState = "connecting" | "connected" | "degraded";

export interface TaskStreamOptions {
  /** Exchanges the panel session for a short-lived socket ticket. */
  getTicket: () => Promise<string | undefined>;
  onUpdate: (update: TaskStreamUpdate) => void;
  onAvailability: (unavailable: boolean) => void;
  onState: (state: TaskStreamState) => void;
}

/** Own one background-task socket and request a fresh ticket on every reconnect. */
export function createTaskStream(options: TaskStreamOptions) {
  let socket: Socket | undefined;
  let disposed = false;

  const path =
    typeof document === "undefined"
      ? "/socket.io"
      : new URL("socket.io", document.baseURI).pathname;

  const connect = () => {
    if (disposed) return;
    socket?.disconnect();
    options.onState("connecting");
    socket = io({
      path,
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      auth: (callback) => {
        void options
          .getTicket()
          .then((ticket) => callback(ticket ? { ticket } : {}))
          .catch(() => callback({}));
      }
    });

    socket.on("connect", () => options.onState("connected"));
    socket.on("disconnect", () => options.onState("degraded"));
    socket.on("connect_error", () => options.onState("degraded"));
    socket.on("tasks/update", (update: TaskStreamUpdate) => options.onUpdate(update));
    socket.on("tasks/availability", (payload: { unavailable?: boolean }) =>
      options.onAvailability(!!payload?.unavailable)
    );
  };

  const disconnect = () => {
    const current = socket;
    socket = undefined;
    if (!current) return;
    current.removeAllListeners();
    current.disconnect();
  };

  return {
    connect,
    disconnect,
    dispose() {
      disposed = true;
      disconnect();
    }
  };
}
