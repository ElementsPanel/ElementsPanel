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

const asyncTaskRegistrations = new Map<string, DaemonAsyncTaskRegistration>();
const scheduleActionHandlers = new Map<string, DaemonScheduleActionHandler>();
const daemonFeatures = new Map<string, boolean>();
const presetCommandFactories = new Map<IPresetCommand, DaemonPresetCommandFactory>();

export function clearDaemonPluginRegistrations() {
  asyncTaskRegistrations.clear();
  scheduleActionHandlers.clear();
  daemonFeatures.clear();
  presetCommandFactories.clear();
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
