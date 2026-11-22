import { InstanceStreamListener, removeTrail } from "mcsmanager-common";
import { io, ManagerOptions, Socket, SocketOptions } from "socket.io-client";
import RemoteRequest from "./remote_command";
import type { RemoteServiceConfig } from "./remote_config";
import { $t, i18next, logger, systemConfig } from "./runtime";
import { publishAvailability, publishTasks } from "./task_stream";

export default class RemoteService {
  public static readonly STATUS_OK = 200;
  public static readonly STATUS_ERR = 500;

  public uuid: string = "";
  public available: boolean = false;
  public socket?: Socket;
  public readonly pendingRequests = new Set<() => void>();
  public readonly instanceStream = new InstanceStreamListener();
  public config: RemoteServiceConfig;
  public realUrl: string = "";

  constructor(uuid: string, config: RemoteServiceConfig) {
    this.uuid = uuid;
    this.config = config;
  }

  private getDaemonInfo() {
    return `Name: ${this.config.remarks} | ID: ${this.uuid} | URL: ${this.realUrl}`;
  }

  public connect(connectOpts?: Partial<SocketOptions & ManagerOptions>) {
    if (connectOpts) this.config.connectOpts = connectOpts;
    let addr = `ws://${this.config.ip}:${this.config.port}`;
    if (this.config.ip.indexOf("wss://") === 0 || this.config.ip.indexOf("ws://") === 0) {
      addr = `${this.config.ip}:${this.config.port}`;
    }
    if (systemConfig().ssl) {
      addr = addr.replace("ws://", "wss://");
    }
    this.realUrl = addr;

    const daemonInfo = this.getDaemonInfo();

    if (this.available) {
      logger().info(`${$t("TXT_CODE_DAEMON_INFO_RESET_CONNECT")}:${daemonInfo}`);
      this.disconnect();
    }

    if (this.socket && this.socket.hasListeners("connect")) {
      logger().info(`${$t("TXT_CODE_DAEMON_INFO_REPLACE_CONNECT")}:${daemonInfo}`);
      return this.refreshReconnect();
    }

    logger().info(`${$t("TXT_CODE_DAEMON_INFO_TRY_CONNECT")}:${daemonInfo}`);
    this.socket = io(this.realUrl, {
      ...this.config.connectOpts,
      path: removeTrail(this.config.prefix, "/") + "/socket.io"
    });

    this.socket.on("connect", async () => {
      logger().info($t("TXT_CODE_DAEMON_INFO_CONNECT", { v: daemonInfo }));
      await this.onConnect();
    });
    this.socket.on("disconnect", async () => {
      logger().info($t("TXT_CODE_DAEMON_INFO_DISCONNECT", { v: daemonInfo }));
      await this.onDisconnect();
    });
    this.socket.on("connect_error", async (_error: Error) => {
      await this.onDisconnect();
    });

    // Forward daemon snapshots to the browser stream with the originating node identity.
    this.socket.on("tasks/update", (packet: any) =>
      publishTasks(this.uuid, this.config.remarks || this.uuid, packet?.data)
    );
  }

  public async setLanguage(language?: string) {
    if (!language) language = i18next().language;
    logger().info(
      `${$t("TXT_CODE_DAEMON_INFO_SET_LANGUAGE")} (${this.config.ip}:${this.config.port}/${
        this.config.remarks
      }) language: ${language}`
    );
    return await new RemoteRequest(this).request("info/setting", {
      language
    });
  }

  public async auth(key?: string) {
    if (key) this.config.apiKey = key;
    const daemonInfo = this.getDaemonInfo();
    const socket = this.socket;
    try {
      const res = await new RemoteRequest(this).request("auth", this.config.apiKey, 5000, true);
      if (this.socket !== socket || !socket?.connected) return false;
      if (res === true) {
        this.available = true;
        try {
          await this.setLanguage();
        } catch (error: any) {
          // A daemon without the node plugin keeps its own language settings.
          logger().warn(
            `Failed to push the panel language to the daemon, the daemon node plugin may be missing: ${daemonInfo}`
          );
        }

        try {
          const info: any = await new RemoteRequest(this).request("info/overview");
          this.config.brand = info?.brand || "";
        } catch (error) {
          this.config.brand = "";
        }

        if (this.socket !== socket || !socket.connected) return false;
        logger().info($t("TXT_CODE_DAEMON_INFO_AUTH_SUCCESS", { v: daemonInfo }));
        publishAvailability();
        return true;
      }
      this.available = false;
      publishAvailability();
      logger().warn($t("TXT_CODE_DAEMON_INFO_AUTH_FAILURE", { v: daemonInfo }));
      return false;
    } catch (error: any) {
      if (this.socket !== socket) return false;
      this.available = false;
      publishAvailability();
      logger().warn($t("TXT_CODE_DAEMON_INFO_AUTH_ERROR", { v: daemonInfo }));
      logger().warn(error);
      return false;
    }
  }

  public emit(event: string, data?: any) {
    return this.socket?.emit(event, data);
  }

  private async onDisconnect() {
    this.available = false;
    publishAvailability();
  }

  private async onConnect() {
    // A connected socket is not available until it has authenticated.
    return await this.auth(this.config.apiKey);
  }

  close() {
    for (const cancel of this.pendingRequests) cancel();
    this.pendingRequests.clear();
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket.close();
      delete this.socket;
    }
    this.socket = undefined;
    this.available = false;
  }

  disconnect() {
    if (this.socket) {
      logger().info($t("TXT_CODE_DAEMON_INFO_CLOSED", { v: this.getDaemonInfo() }));
    }
    this.close();
  }

  refreshReconnect() {
    this.disconnect();
    this.connect();
  }
}
