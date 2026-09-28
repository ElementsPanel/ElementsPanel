import { v4 } from "uuid";
import type { IPacket, IRequestPacket } from "../../../../src/app/plugin/packets";
import RemoteService from "./remote_entity";
import { $t } from "./runtime";

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

// Use RemoteRequest to send Socket.io events and data to remote services,
// and support synchronous response data (such as HTTP).
export default class RemoteRequest {
  constructor(public readonly rService?: RemoteService) {
    if (!this.rService || !this.rService.socket) throw new Error($t("TXT_CODE_ca8072bd"));
  }

  // request to remote daemon
  public async request<T = any>(
    event: string,
    data?: any,
    timeout = 6000,
    force = false
  ): Promise<T> {
    if (!this.rService || !this.rService.socket) throw new Error($t("TXT_CODE_3d94ea16"));
    if (!this.rService.available && !force)
      throw new Error($t("TXT_CODE_b7d38e78") + ` IP: ${this.rService.config.ip}`);
    if (!this.rService.socket.connected && !force)
      throw new Error($t("TXT_CODE_7c650d80") + ` IP: ${this.rService.config.ip}`);

    const service = this.rService;
    const socket = this.rService.socket;
    const disconnectedMessage = $t("TXT_CODE_7c650d80") + ` IP: ${service.config.ip}`;
    const timeoutMessage = [$t("TXT_CODE_bd99b64e"), service.config.ip].join(" ");
    return new Promise((resolve, reject) => {
      let countdownTask: NodeJS.Timeout | undefined;
      const uuid = [v4(), new Date().getTime()].join("");
      const protocolData: IRequestPacket = { uuid, data };

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
      // send command
      try {
        socket.emit(event, protocolData);
      } catch (error) {
        cleanup();
        reject(error);
      }
    });
  }
}
