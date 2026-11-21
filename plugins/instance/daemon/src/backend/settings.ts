import type { DaemonPluginContext } from "../../../../../core/daemon/src/plugin";
import {
  INSTANCE_NUMBER_SETTINGS,
  instanceSetting,
  type InstanceNumberSetting
} from "./instance_settings";

const INSTANCE_SETTING_MESSAGES: Record<
  InstanceNumberSetting,
  { title: string; description: string; unit?: string }
> = {
  instanceAutoRestartResetSeconds: {
    title: "TXT_CODE_INSTANCE_SETTING_INSTANCE_AUTO_RESTART_RESET_SECONDS",
    description: "TXT_CODE_INSTANCE_SETTING_INSTANCE_AUTO_RESTART_RESET_SECONDS_DESC",
    unit: "s"
  },
  instanceLogMaxSizeKB: {
    title: "TXT_CODE_INSTANCE_SETTING_INSTANCE_LOG_MAX_SIZE_KB",
    description: "TXT_CODE_INSTANCE_SETTING_INSTANCE_LOG_MAX_SIZE_KB_DESC",
    unit: "KB"
  },
  instanceDiskCheckIntervalSeconds: {
    title: "TXT_CODE_INSTANCE_SETTING_INSTANCE_DISK_CHECK_INTERVAL_SECONDS",
    description: "TXT_CODE_INSTANCE_SETTING_INSTANCE_DISK_CHECK_INTERVAL_SECONDS_DESC",
    unit: "s"
  },
  instanceStopTimeoutSeconds: {
    title: "TXT_CODE_INSTANCE_SETTING_INSTANCE_STOP_TIMEOUT_SECONDS",
    description: "TXT_CODE_INSTANCE_SETTING_INSTANCE_STOP_TIMEOUT_SECONDS_DESC",
    unit: "s"
  },
  instanceScheduleMaxTasks: {
    title: "TXT_CODE_INSTANCE_SETTING_INSTANCE_SCHEDULE_MAX_TASKS",
    description: "TXT_CODE_INSTANCE_SETTING_INSTANCE_SCHEDULE_MAX_TASKS_DESC"
  },
  instanceScheduleMaxActions: {
    title: "TXT_CODE_INSTANCE_SETTING_INSTANCE_SCHEDULE_MAX_ACTIONS",
    description: "TXT_CODE_INSTANCE_SETTING_INSTANCE_SCHEDULE_MAX_ACTIONS_DESC"
  }
};

export function registerSettings(ctx: DaemonPluginContext) {
  const $t = ctx.i18n.$t;
  ctx.inject(["settingsForm"], (settingsCtx) =>
    settingsCtx.settingsForm.declare({
      defaults: () => ({ ...ctx.settings.defaults() }),
      fields: () => [
        ...Object.entries(INSTANCE_NUMBER_SETTINGS).map(([key, range]) => ({
          key,
          type: "number" as const,
          title: $t(INSTANCE_SETTING_MESSAGES[key as InstanceNumberSetting].title),
          description: $t(INSTANCE_SETTING_MESSAGES[key as InstanceNumberSetting].description),
          unit: INSTANCE_SETTING_MESSAGES[key as InstanceNumberSetting].unit,
          min: range.min,
          max: range.max
        })),
        {
          key: "instanceStopForceKill",
          type: "boolean",
          title: $t("TXT_CODE_INSTANCE_SETTING_INSTANCE_STOP_FORCE_KILL"),
          description: $t("TXT_CODE_INSTANCE_SETTING_INSTANCE_STOP_FORCE_KILL_DESC")
        },
        {
          key: "enableSoftShutdown",
          type: "boolean",
          title: $t("TXT_CODE_DAEMON_ENABLE_SOFT_SHUTDOWN"),
          description: $t("TXT_CODE_DAEMON_ENABLE_SOFT_SHUTDOWN_INFO")
        },
        {
          key: "softShutdownSkipDocker",
          type: "boolean",
          title: $t("TXT_CODE_DAEMON_SOFT_SHUTDOWN_SKIP_DOCKER"),
          description: $t("TXT_CODE_DAEMON_SOFT_SHUTDOWN_SKIP_DOCKER_INFO"),
          visibleWhen: "enableSoftShutdown"
        },
        {
          key: "softShutdownWaitSeconds",
          type: "number",
          title: $t("TXT_CODE_DAEMON_SOFT_SHUTDOWN_WAIT_SECONDS"),
          description: $t("TXT_CODE_DAEMON_SOFT_SHUTDOWN_WAIT_SECONDS_INFO"),
          unit: "s",
          min: 1,
          max: 600,
          visibleWhen: "enableSoftShutdown"
        }
      ],
      read: () => ({
        ...Object.fromEntries(
          Object.keys(INSTANCE_NUMBER_SETTINGS).map((key) => [
            key,
            instanceSetting(key as InstanceNumberSetting)
          ])
        ),
        instanceStopForceKill: ctx.settings.config.instanceStopForceKill === true,
        enableSoftShutdown: ctx.settings.config.enableSoftShutdown,
        softShutdownSkipDocker: ctx.settings.config.softShutdownSkipDocker,
        softShutdownWaitSeconds: ctx.settings.config.softShutdownWaitSeconds
      }),
      write: (values) => {
        const config = ctx.settings.config;
        // Validate every field before applying any change, including direct service calls.
        for (const [key, range] of Object.entries(INSTANCE_NUMBER_SETTINGS)) {
          const value = values[key];
          if (
            value !== undefined &&
            (!Number.isInteger(value) || Number(value) < range.min || Number(value) > range.max)
          ) {
            throw new Error(
              $t(INSTANCE_SETTING_MESSAGES[key as InstanceNumberSetting].description)
            );
          }
        }
        for (const key of [
          "instanceStopForceKill",
          "enableSoftShutdown",
          "softShutdownSkipDocker"
        ]) {
          if (values[key] !== undefined && typeof values[key] !== "boolean") {
            throw new Error(`Invalid boolean setting: ${key}`);
          }
        }
        const seconds = values.softShutdownWaitSeconds;
        if (
          seconds !== undefined &&
          (!Number.isInteger(seconds) || Number(seconds) < 1 || Number(seconds) > 600)
        ) {
          throw new Error($t("TXT_CODE_DAEMON_SOFT_SHUTDOWN_WAIT_SECONDS_INFO"));
        }
        const previous = { ...config };
        for (const key of Object.keys(INSTANCE_NUMBER_SETTINGS) as InstanceNumberSetting[]) {
          if (values[key] !== undefined) config[key] = Number(values[key]);
        }
        if (values.instanceStopForceKill !== undefined)
          config.instanceStopForceKill = values.instanceStopForceKill as boolean;
        if (values.enableSoftShutdown !== undefined)
          config.enableSoftShutdown = values.enableSoftShutdown as boolean;
        if (values.softShutdownSkipDocker !== undefined)
          config.softShutdownSkipDocker = values.softShutdownSkipDocker as boolean;
        if (seconds !== undefined) config.softShutdownWaitSeconds = Number(seconds);
        try {
          ctx.settings.save();
        } catch (error) {
          Object.assign(config, previous);
          throw error;
        }
      }
    })
  );
}
