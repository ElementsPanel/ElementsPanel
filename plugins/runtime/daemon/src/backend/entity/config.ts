import { v4 } from "uuid";
import type { DaemonStorageService } from "../../../../../../core/daemon/src/plugin/context";

function builderPassword() {
  const a = `${v4().replace(/-/gim, "")}`;
  const b = a.slice(0, a.length / 2 - 1);
  const c = `${v4().replace(/-/gim, "")}`;
  return b + c;
}

class Config {
  public version = 2;
  public ip = "";
  public port = 24444;
  public prefix = "";
  // Undefined until the node plugin imports the panel's legacy mappings or saves its own.
  public remoteMappings?: Array<{
    from: { ip: string; port: number; prefix: string };
    to: { ip: string; port: number; prefix: string };
  }>;
  public key = builderPassword();
  public maxFileTask = 2;
  public maxZipFileSize = 200;
  public maxFileEditSizeMiB = 5;
  public language = "en_us";
  public followPanelLanguage = true;
  public defaultInstancePath = "";
  public defaultJavaDataPath = "";
  public instanceBackupPath = "data/backups";
  public instanceBackupFormat = "zip";
  public instanceBackupCompressionLevel = 9;
  // Maximum total size of one instance's backup archives, in GB. 0 = unlimited.
  public instanceBackupMaxSize = 0;
  public allocatablePortRange = [10010, 65500];
  public currentAllocatablePort = 10010;
  public portAssignInterval = 5;

  // Upload rate in 64 KB packets per second; 0 is unlimited.
  public uploadSpeedRate = 0;
  // Download rate in 64 KB packets per second; 0 is unlimited.
  public downloadSpeedRate = 0;
  // Download concurrency; 0 is unlimited.
  public maxDownloadFromUrlFileCount = 1;

  // Terminal buffer chunk limit, 16-4096. Each chunk holds up to 256 characters; flush every 50 ms.
  public outputBufferSize = 256;

  public enableSoftShutdown = true;
  public softShutdownSkipDocker = true;
  public softShutdownWaitSeconds = 30;

  // Instance defaults do not override per-instance event settings.
  public instanceAutoRestartResetSeconds = 0;
  public instanceLogMaxSizeKB = 512;
  public instanceDiskCheckIntervalSeconds = 45;
  public instanceStopTimeoutSeconds = 600;
  public instanceStopForceKill = false;
  public instanceScheduleMaxTasks = 8;
  public instanceScheduleMaxActions = 10;

  public whiteListPanelIp = false;
  public whiteListPanelIps = ["127.0.0.1", "::1"];

  ssl = false;
  sslPemPath = "";
  sslKeyPath = "";
}

class GlobalConfiguration {
  public config = new Config();
  private static readonly ID = "global";
  private storage?: DaemonStorageService;

  configure(storage: DaemonStorageService) {
    this.storage = storage;
  }

  load() {
    if (!this.storage) throw new Error("Daemon storage has not been initialized.");
    let config: Config = this.storage.load("Config", Config, GlobalConfiguration.ID);
    if (config == null) {
      config = new Config();
      this.storage.store("Config", GlobalConfiguration.ID, config);
    }
    this.config = config;
  }

  store() {
    if (!this.storage) throw new Error("Daemon storage has not been initialized.");
    this.storage.store("Config", GlobalConfiguration.ID, this.config);
  }
}

class GlobalEnv {
  public fileTaskCount = 0;
}

const globalConfiguration = new GlobalConfiguration();
const globalEnv = new GlobalEnv();

export { Config, globalConfiguration, globalEnv };
