import { globalConfiguration } from "./entity/config";

export const INSTANCE_NUMBER_SETTINGS = {
  instanceAutoRestartResetSeconds: { default: 0, min: 0, max: 86400 },
  instanceLogMaxSizeKB: { default: 512, min: 0, max: 65536 },
  instanceDiskCheckIntervalSeconds: { default: 45, min: 10, max: 3600 },
  instanceStopTimeoutSeconds: { default: 600, min: 1, max: 3600 },
  instanceScheduleMaxTasks: { default: 8, min: 1, max: 128 },
  instanceScheduleMaxActions: { default: 10, min: 1, max: 128 }
} as const;

export type InstanceNumberSetting = keyof typeof INSTANCE_NUMBER_SETTINGS;

/** Old configuration files and invalid stored values use the documented defaults. */
export function instanceSetting(key: InstanceNumberSetting): number {
  const { default: fallback, min, max } = INSTANCE_NUMBER_SETTINGS[key];
  const value = globalConfiguration.config[key];
  return Number.isInteger(value) && value >= min && value <= max ? value : fallback;
}
