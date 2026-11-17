import fs from "fs-extra";
import path from "path";
import type { IRemoteService } from "../../../../../core/panel/src/app/plugin/packets";
import { UniversalRemoteSubsystem } from "./remote_base";
import { RemoteServiceConfig } from "./remote_config";
import RemoteService from "./remote_entity";
import { $t, core, logger, storage } from "./runtime";

// Manage stored daemon connections and request forwarding.
class RemoteServiceSubsystem extends UniversalRemoteSubsystem<RemoteService> {
  async initialize() {
    // Load stored nodes, or discover localhost on the first startup.
    for (const uuid of await storage().getStorage().list("RemoteServiceConfig")) {
      const config = (await storage()
        .getStorage()
        .load("RemoteServiceConfig", RemoteServiceConfig, uuid)) as RemoteServiceConfig;
      const newService = new RemoteService(uuid, config);
      this.setInstance(uuid, newService);
      newService.connect();
    }

    if (this.services.size === 0) {
      await this.initConnectLocalhost("");
    }

    logger().info($t("TXT_CODE_SYSTEM_REMOTE_SERVICE_NODE_COUNT", { n: this.services.size }));

    // Register for periodic connection status checks. `ctx.setInterval` is
    // cancelled when the plugin unloads, so the check leaves with it.
    core().setInterval(() => this.connectionStatusCheckTask(), 1000 * 60);
  }

  async registerRemoteService(config: IRemoteService) {
    const instance = await this.newInstance(config);
    if (!instance) throw new Error($t("TXT_CODE_COMMON_THE_TARGET_INSTANCE_DOES_NOT_EXIST"));
    instance.connect();
    return instance;
  }

  async deleteRemoteService(uuid: string) {
    if (this.getInstance(uuid)) {
      await storage().getStorage().delete("RemoteServiceConfig", uuid);
      this.getInstance(uuid)?.disconnect();
      this.deleteInstance(uuid);
    }
  }

  async newInstance(config: IRemoteService) {
    const instance = new RemoteService(
      config.uuid || this.randdomUuid(),
      new RemoteServiceConfig()
    );
    this.setInstance(instance.uuid, instance);
    try {
      await this.edit(instance.uuid, config);
    } catch (error) {
      this.deleteInstance(instance.uuid);
      throw error;
    }
    return instance;
  }

  async edit(uuid: string, config: IRemoteService) {
    const instance = this.getInstance(uuid);
    if (!instance) throw new Error("Instance does not exist");
    const next = Object.assign(new RemoteServiceConfig(), instance.config);
    if (config.remarks != null) next.remarks = String(config.remarks);
    if (config.ip != null) {
      if (typeof config.ip !== "string" || !config.ip.trim()) throw new Error("Invalid daemon address");
      next.ip = config.ip.trim();
    }
    if (config.port != null) {
      const port = Number(config.port);
      if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid daemon port");
      next.port = port;
    }
    if (config.prefix != null) next.prefix = String(config.prefix);
    if (config.apiKey != null) next.apiKey = String(config.apiKey);
    if (config.remoteMappings != null) {
      if (!Array.isArray(config.remoteMappings)) throw new Error("Invalid daemon mappings");
      next.remoteMappings = config.remoteMappings;
    }
    await storage().getStorage().store("RemoteServiceConfig", instance.uuid, next);
    instance.config = next;
  }

  // Register localhost on first use, even if its daemon is not reachable yet.
  async initConnectLocalhost(key?: string) {
    const ip = "localhost";
    const localKeyFilePath = path.normalize(
      process.env.EPANEL_LOCAL_DAEMON_CONFIG || path.join(process.cwd(), "../daemon/data/Config/global.json")
    );
    logger().info($t("TXT_CODE_SYSTEM_REMOTE_SERVICE_LOAD_DAEMON_TITLE", { localKeyFilePath }));
    if (fs.existsSync(localKeyFilePath)) {
      logger().info($t("TXT_CODE_SYSTEM_REMOTE_SERVICE_AUTO_CHECK_DAEMON"));
      const localDaemonConfig = JSON.parse(
        fs.readFileSync(localKeyFilePath, { encoding: "utf-8" })
      );
      const localKey = localDaemonConfig.key;
      const localPort = localDaemonConfig.port;
      return await this.registerRemoteService({ apiKey: localKey, port: localPort, ip, prefix: localDaemonConfig.prefix || "" });
    } else if (key) {
      const port = 24444;
      return await this.registerRemoteService({ apiKey: key, port, ip });
    }
    logger().warn($t("TXT_CODE_SYSTEM_REMOTE_SERVICE_ERROR"));

    // Retry localhost discovery every five seconds until connected. The scoped timer stops on unload.
    core().setTimeout(() => {
      if (this.services.size === 0) return this.initConnectLocalhost();
    }, 5 * 1000);
  }

  count() {
    let total = 0;
    let available = 0;
    this.services.forEach((v) => {
      total++;
      if (v.available) available++;
    });
    return { available, total };
  }

  connectionStatusCheckTask() {
    this.services?.forEach((v) => {
      if (v && v.available === false) {
        logger().warn(
          `Daemon exception detected: ${v.config.remarks} ${v.config.ip}:${v.config.port}, reconnecting...`
        );
        return v.connect();
      }
    });
  }

  changeDaemonLanguage(language: string) {
    for (const iterator of this.services.entries()) {
      // Daemons without the node plugin do not handle "info/setting".
      iterator[1].setLanguage(language).catch(() => {});
    }
  }
}

export default new RemoteServiceSubsystem();
