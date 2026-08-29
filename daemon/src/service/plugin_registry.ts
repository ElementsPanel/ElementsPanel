import type Instance from "../entity/instance/instance";
import type InstanceCommand from "../entity/commands/base/command";
import type { IPresetCommand } from "../entity/commands/dispatcher";
import type { IAsyncTask } from "./async_task_service";

export interface DaemonAsyncTaskRegistration {
  type: string;
  create: (instance: Instance, parameter?: any) => IAsyncTask;
  /**
   * Set to false for a task that builds its own instance, such as creating one
   * from a market package. Those receive `undefined` as the instance.
   */
  requiresInstance?: boolean;
  /** Minimum caller role the panel must report. Unset means any role. */
  requiredRole?: number;
}

export type DaemonScheduleActionHandler = (
  instance: Instance,
  payload: string
) => Promise<void> | void;

/** Builds the command backing one instance preset, per instance. */
export type DaemonPresetCommandFactory = () => InstanceCommand;

/** Contributes extra fields to the `info/overview` payload. */
export type DaemonOverviewProvider = () =>
  | Record<string, unknown>
  | Promise<Record<string, unknown>>;

const asyncTaskRegistrations = new Map<string, DaemonAsyncTaskRegistration>();
const scheduleActionHandlers = new Map<string, DaemonScheduleActionHandler>();
const daemonFeatures = new Map<string, boolean>();
const presetCommandFactories = new Map<IPresetCommand, DaemonPresetCommandFactory>();
const overviewProviders = new Set<DaemonOverviewProvider>();

export function clearDaemonPluginRegistrations() {
  asyncTaskRegistrations.clear();
  scheduleActionHandlers.clear();
  daemonFeatures.clear();
  presetCommandFactories.clear();
  overviewProviders.clear();
}

export function registerDaemonAsyncTask(
  taskName: string,
  registration: DaemonAsyncTaskRegistration
) {
  if (!taskName || !registration?.type || typeof registration.create !== "function") {
    throw new Error("Invalid daemon async task registration");
  }
  if (asyncTaskRegistrations.has(taskName)) {
    throw new Error(`Duplicate daemon async task: ${taskName}`);
  }
  asyncTaskRegistrations.set(taskName, registration);
}

export function getDaemonAsyncTaskRegistration(taskName: string) {
  return asyncTaskRegistrations.get(taskName);
}

export function registerDaemonScheduleAction(
  actionType: string,
  handler: DaemonScheduleActionHandler
) {
  if (!actionType || typeof handler !== "function") {
    throw new Error("Invalid daemon schedule action registration");
  }
  if (scheduleActionHandlers.has(actionType)) {
    throw new Error(`Duplicate daemon schedule action: ${actionType}`);
  }
  scheduleActionHandlers.set(actionType, handler);
}

export function getDaemonScheduleActionHandler(actionType: string) {
  return scheduleActionHandlers.get(actionType);
}

export function registerDaemonFeature(feature: string) {
  if (!feature) throw new Error("Invalid daemon feature registration");
  daemonFeatures.set(feature, true);
}

export function hasDaemonFeature(feature: string) {
  return daemonFeatures.get(feature) === true;
}

/**
 * Supply the command behind one instance preset. `FunctionDispatcher` applies
 * these after its own defaults, so a plugin can provide a preset the core has
 * no implementation for — `install`, which needs the market — or replace one it
 * does. Without the plugin the preset is simply absent and `execPreset` is a
 * no-op.
 */
export function registerDaemonPresetCommand(
  preset: IPresetCommand,
  factory: DaemonPresetCommandFactory
) {
  if (!preset || typeof factory !== "function") {
    throw new Error("Invalid daemon preset command registration");
  }
  if (presetCommandFactories.has(preset)) {
    throw new Error(`Duplicate daemon preset command: ${preset}`);
  }
  presetCommandFactories.set(preset, factory);
}

export function getDaemonPresetCommands(): ReadonlyMap<IPresetCommand, DaemonPresetCommandFactory> {
  return presetCommandFactories;
}

/**
 * Contribute extra fields to `info/overview`. The core reports what the panel
 * needs to route and describe this daemon; anything a plugin collects on top —
 * the monitoring plugin's CPU/memory history, for instance — is added here.
 */
export function registerDaemonOverviewProvider(provider: DaemonOverviewProvider) {
  if (typeof provider !== "function") throw new Error("Invalid daemon overview provider");
  overviewProviders.add(provider);
}

/**
 * Merge every provider's fields into the overview payload. A provider that
 * throws is skipped: one broken extra must not make the daemon unreadable to
 * the panel.
 */
export async function collectDaemonOverviewExtras(): Promise<Record<string, unknown>> {
  const extras: Record<string, unknown> = {};
  for (const provider of overviewProviders) {
    try {
      Object.assign(extras, await provider());
    } catch (error) {
      // Leave the field out rather than failing the whole response.
    }
  }
  return extras;
}
