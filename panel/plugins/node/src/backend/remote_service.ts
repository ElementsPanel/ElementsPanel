import fs from "fs-extra";
import path from "path";
import type { IRemoteService } from "../../../../src/app/entity/entity_interface";
import { UniversalRemoteSubsystem } from "./remote_base";
import { RemoteServiceConfig } from "./remote_config";
import RemoteService from "./remote_entity";
import { $t, core, logger, storage } from "./runtime";

// The RemoteServiceSubsystem will be one of the most important systems
// main function is to store remote services everywhere
// Scan local services, unified management, remote calls and proxies, etc.
class RemoteServiceSubsystem extends UniversalRemoteSubsystem<RemoteService> {
  async initialize() {
    // If it is the first startup, it will automatically try to connect to "LocalHost",
    // otherwise it will automatically read from the configuration file and connect to all remote services.
    for (const uuid of await storage().getStorage().list("RemoteServiceConfig")) {
      const config = (await storage()
        .getStorage()
        .load("RemoteServiceConfig", RemoteServiceConfig, uuid)) as RemoteServiceConfig;
      const newService = new RemoteService(uuid, config);
      this.setInstance(uuid, newService);
      newService.connect();
    }

    // If there is no daemon process, check whether there is a daemon process locally
    if (this.services.size === 0) {
      await this.initConnectLocalhost("");
    }

    logger().info($t("TXT_CODE_systemRemoteService.nodeCount", { n: this.services.size }));

    // Register for periodic connection status checks. `ctx.setInterval` is
    // cancelled when the plugin unloads, so the check leaves with it.
    core().setInterval(() => this.connectionStatusCheckTask(), 1000 * 60);
  }

  // Register a NEW remote service to system and connect it.
  // Like: this.registerRemoteService({
  // ip: "127.0.0.1",
  // apiKey: "test_key",
  // port: 24444
  // });
  async registerRemoteService(config: IRemoteService) {
    const instance = await this.newInstance(config);
    if (!instance) throw new Error($t("TXT_CODE_3bfb9e04"));
    await storage().getStorage().store("RemoteServiceConfig", instance.uuid, instance.config);
    instance.connect();
    return instance;
  }

  // Delete the specified remote service based on UUID
  async deleteRemoteService(uuid: string) {
    if (this.getInstance(uuid)) {
      this.getInstance(uuid)?.disconnect();
      this.deleteInstance(uuid);
      await storage().getStorage().delete("RemoteServiceConfig", uuid);
    }
  }

  // According to the IRemoteService, New a RemoteService object
  // Used to initialize objects.
  async newInstance(config: IRemoteService) {
    const instance = new RemoteService(
      config.uuid || this.randdomUuid(),
      new RemoteServiceConfig()
    );
    this.setInstance(instance.uuid, instance);
    await this.edit(instance.uuid, config);
    return instance;
  }

  // Edit the configuration file of the instance
  async edit(uuid: string, config: IRemoteService) {
    const instance = this.getInstance(uuid);
    if (!instance) return;
    if (config.remarks) instance.config.remarks = config.remarks;
    if (config.ip) instance.config.ip = config.ip;
    if (config.port) instance.config.port = config.port;
    if (config.prefix != null) instance.config.prefix = config.prefix;
    if (config.apiKey) instance.config.apiKey = config.apiKey;
    if (config.remoteMappings != null) instance.config.remoteMappings = config.remoteMappings;
    await storage().getStorage().store("RemoteServiceConfig", instance.uuid, instance.config);
  }

  // Scannce localhost service
  // First use, need to scan the local host
  // Note: Every time you execute "initConnectLocalhost",
  // it will be managed by the subsystem (regardless of whether the target exists).
  async initConnectLocalhost(key?: string) {
    const ip = "localhost";
    const localKeyFilePath = path.normalize(
      path.join(process.cwd(), "../daemon/data/Config/global.json")
    );
    logger().info($t("TXT_CODE_systemRemoteService.loadDaemonTitle", { localKeyFilePath }));
    if (fs.existsSync(localKeyFilePath)) {
      logger().info($t("TXT_CODE_systemRemoteService.autoCheckDaemon"));
      const localDaemonConfig = JSON.parse(
        fs.readFileSync(localKeyFilePath, { encoding: "utf-8" })
      );
      const localKey = localDaemonConfig.key;
      const localPort = localDaemonConfig.port;
      return await this.registerRemoteService({ apiKey: localKey, port: localPort, ip });
    } else if (key) {
      const port = 24444;
      return await this.registerRemoteService({ apiKey: key, port, ip });
    }
    logger().warn($t("TXT_CODE_systemRemoteService.error"));

    // After 5 seconds, determine whether the daemon has been connected until a
    // daemon is connected. `ctx.setTimeout` is cancelled when the plugin
    // unloads, so a panel without this plugin stops retrying.
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

  // Periodic connection status check
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
