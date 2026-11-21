import { v4 } from "uuid";
import type { IPacket, IRequestPacket } from "../../../../../../core/panel/src/app/plugin/packets";
import RemoteService from "./remote_entity";
import { $t, core } from "./runtime";
import { taskRequestScope } from "./background_tasks";

class RemoteError extends Error {
  constructor(msg: string) {
    super(msg);
  }
}

export class RemoteRequestTimeoutError extends RemoteError {
  constructor(msg: string) {
    super(msg);
  }
}

// Forward protocol events to a daemon and await its response.
export default class RemoteRequest {
  constructor(public readonly rService?: RemoteService) {
    if (!this.rService || !this.rService.socket) throw new Error($t("TXT_CODE_COMMON_INITIALIZATION_FAILED_THE_REMOTE_NODE_DOES_NOT_EXIST"));
  }

  public async request<T = any>(
    event: string,
    data?: any,
    timeout = 6000,
    force = false
  ): Promise<T> {
    if (!this.rService || !this.rService.socket) throw new Error($t("TXT_CODE_COMMON_THE_NODE_SOCKET_IS_ABNORMAL_PLEASE_TRY_TO_RECONNECT_IN_THE_NODE_MANAGEMENT"));
    if (!this.rService.available && !force)
      throw new Error($t("TXT_CODE_COMMON_THE_REMOTE_NODE_IS_UNAVAILABLE_PLEASE_CONTACT_THE_ADMINISTRATOR_TO_GO_TO_THE_NODE_LIST_TO") + ` IP: ${this.rService.config.ip}`);
    if (!this.rService.socket.connected && !force)
      throw new Error($t("TXT_CODE_NODE_CONNECTION_FAILED_HINT") + ` IP: ${this.rService.config.ip}`);

    const service = this.rService;
    const socket = this.rService.socket;
    const disconnectedMessage = $t("TXT_CODE_NODE_CONNECTION_FAILED_HINT") + ` IP: ${service.config.ip}`;
    const timeoutMessage = [$t("TXT_CODE_COMMON_REQUEST_TIMEOUT_PLEASE_CONTACT_THE_ADMINISTRATOR_TO_CHECK_THE_NODE_NETWORK_STATUS_IP"), service.config.ip].join(" ");
    const result = await new Promise<T>((resolve, reject) => {
      let countdownTask: NodeJS.Timeout | undefined;
      const uuid = [v4(), new Date().getTime()].join("");
      const requestCtx = taskRequestScope.getStore();
      // Derive ownership from the authenticated request, never from browser data.
      const owner = requestCtx ? core().identity.of(requestCtx).uuid || "_anonymous_" : undefined;
      const protocolData: IRequestPacket = {
        uuid,
        data: data && typeof data === "object" && !Array.isArray(data) ? { ...data, _taskOwner: owner } : data
      };

      const cleanup = () => {
        if (countdownTask) clearTimeout(countdownTask);
        socket.removeListener(event, fn);
        socket.removeListener("disconnect", disconnected);
        service.pendingRequests.delete(disconnected);
      };
      const disconnected = () => {
        cleanup();
        reject(new RemoteError(disconnectedMessage));
      };
      const fn = (msg: IPacket) => {
        if (msg && msg.uuid === uuid) {
          cleanup();
          if (msg.status == RemoteService.STATUS_OK) resolve(msg.data);
          else reject(new RemoteError(String(msg.data?.err ?? msg.data ?? "Remote request failed")));
        }
      };

      if (timeout) {
        countdownTask = setTimeout(() => {
          cleanup();
          reject(new RemoteRequestTimeoutError(timeoutMessage));
        }, timeout);
      }

      socket.on(event, fn);
      socket.on("disconnect", disconnected);
      service.pendingRequests.add(disconnected);
      try {
        socket.emit(event, protocolData);
      } catch (error) {
        cleanup();
        reject(error);
      }
    });

    if (event === "info/overview" && service.socket === socket && socket.connected) {
      const overview = result as { remoteMappings?: typeof service.config.remoteMappings | null };
      // Older daemons omit this field and continue to use the panel's saved mappings.
      if (overview?.remoteMappings === null) {
        overview.remoteMappings = await this.request("node/mappings", {
          remoteMappings: service.config.remoteMappings
        });
      }
      if (Array.isArray(overview?.remoteMappings) && service.socket === socket && socket.connected) {
        service.config.remoteMappings = overview.remoteMappings;
      }
    }
    return result;
  }
}
