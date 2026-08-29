import type Instance from "../entity/instance/instance";
import type { IAsyncTask } from "./async_task_service";

export interface DaemonAsyncTaskRegistration {
  type: string;
  create: (instance: Instance, parameter?: any) => IAsyncTask;
}

export type DaemonScheduleActionHandler = (
  instance: Instance,
  payload: string
) => Promise<void> | void;

const asyncTaskRegistrations = new Map<string, DaemonAsyncTaskRegistration>();
const scheduleActionHandlers = new Map<string, DaemonScheduleActionHandler>();
const daemonFeatures = new Map<string, boolean>();

export function clearDaemonPluginRegistrations() {
  asyncTaskRegistrations.clear();
  scheduleActionHandlers.clear();
  daemonFeatures.clear();
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
