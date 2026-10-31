import type { DaemonPluginContext } from "../../../../../core/daemon/src/plugin";
import os from "os";
import path from "path";
import { bundledToolPath } from "mcsmanager-common";
import type Instance from "./entity/instance/instance";

interface InstanceRuntimeState {
  context: DaemonPluginContext;
  settings: DaemonPluginContext["settings"];
  storage: DaemonPluginContext["storage"];
  stopping: boolean;
  handover?: {
    instances: readonly Instance[];
    shutdown(): Promise<void>;
    release(): void;
  };
}

const INSTANCE_RUNTIME = Symbol.for("elementspanel.daemon.instance-runtime");
let runtime: InstanceRuntimeState | undefined;

export function setPluginContext(value: DaemonPluginContext) {
  // Retained process callbacks can come from an evicted module. Give every
  // generation the same bridge, owned by this daemon rather than the module.
  const host = value.root as DaemonPluginContext & {
    [INSTANCE_RUNTIME]?: InstanceRuntimeState;
  };
  runtime = host[INSTANCE_RUNTIME];
  if (!runtime) {
    const state: InstanceRuntimeState = {
      context: value,
      settings: value.settings,
      storage: value.storage,
      stopping: false
    };
    host[INSTANCE_RUNTIME] = runtime = state;
    host.on("dispose", async () => {
      state.stopping = true;
      // A replacement may fail before it can claim the retained processes.
      // The daemon still owns them and must stop them during real shutdown.
      await state.handover?.shutdown();
      state.handover = undefined;
    });
  }
  if (runtime.stopping) throw new Error("The daemon is shutting down.");
  runtime.context = value;
  runtime.settings = value.settings;
  runtime.storage = value.storage;
  return runtime;
}

export function core(): DaemonPluginContext {
  if (!runtime) throw new Error("The instance plugin has not been initialized yet.");
  return runtime.context;
}

function required<T>(name: string): T {
  const value =
    core().get(name) ??
    // Process exit and shutdown can happen between foundation generations.
    (name === "settings" ? runtime?.settings : name === "storage" ? runtime?.storage : undefined);
  if (value === undefined) throw new Error(`Daemon service is unavailable: ${name}`);
  return value as T;
}

export const settings = () => required<DaemonPluginContext["settings"]>("settings");
export const storage = () => required<DaemonPluginContext["storage"]>("storage");
export const files = () => required<DaemonPluginContext["files"]>("files");
export const transfer = () => required<DaemonPluginContext["transfer"]>("transfer");
export const tasks = () => required<DaemonPluginContext["tasks"]>("tasks");
export const schedules = () => required<DaemonPluginContext["schedules"]>("schedules");
export const presets = () => required<DaemonPluginContext["presets"]>("presets");
export const protocol = () => required<DaemonPluginContext["protocol"]>("protocol");
export const javaManager = () => core().get("javaManager");
export const config = () => settings().config;
export const $t = (key: string, options?: any): string =>
  (core().get("i18n")?.$t(key, options) ?? key) as unknown as string;

// The core logger is exposed as a callable service by cordis. Instance modules
// historically used a namespaced logger object, so keep that small adapter here.
export const logger = {
  info: (...args: any[]) => (core().get("logger") as any)?.info(...args),
  warn: (...args: any[]) => (core().get("logger") as any)?.warn(...args),
  error: (...args: any[]) => (core().get("logger") as any)?.error(...args),
  debug: (...args: any[]) => (core().get("logger") as any)?.debug(...args)
};

export const getCommonHeaders = (url?: string) => {
  const headers: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    Accept: "*/*",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    Connection: "keep-alive"
  };
  if (url) {
    try {
      headers.Referer = new URL(url).origin;
    } catch {
      // Ignore invalid URLs.
    }
  }
  return headers;
};

export const paths = {
  pty: pathFor("pty"),
  frpc: pathFor("frpc"),
  steamCmd: pathFor("steamcmd")
};

export const globalConfiguration = {
  get config() {
    return config();
  },
  load() {
    // The daemon loads the shared configuration before plugins start.
  },
  store() {
    settings().save();
  }
};

function pathFor(name: string) {
  if (name === "pty") return bundledToolPath(name);
  const platform = os.platform();
  const arch = os.arch();
  const suffix = platform === "win32" ? ".exe" : "";
  if (name === "steamcmd") {
    return path.normalize(
      path.join(process.cwd(), "lib", platform === "win32" ? "steamcmd.exe" : `steamcmd_${arch}`)
    );
  }
  return path.normalize(path.join(process.cwd(), "lib", `${name}_${platform}_${arch}${suffix}`));
}
