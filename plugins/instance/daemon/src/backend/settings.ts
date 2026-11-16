import type { DaemonPluginContext } from "../../../../../core/daemon/src/plugin";
import {
  INSTANCE_NUMBER_SETTINGS,
  instanceSetting,
  type InstanceNumberSetting
} from "./instance_settings";

export function registerSettings(ctx: DaemonPluginContext) {
  const $t = ctx.i18n.$t;
  ctx.inject(["settingsForm"], (settingsCtx) =>
    settingsCtx.settingsForm.declare({
      fields: () => [
        ...Object.entries(INSTANCE_NUMBER_SETTINGS).map(([key, range]) => ({
          key,
          type: "number" as const,
          title: $t(`TXT_CODE_INSTANCE_SETTING_${key}`),
          description: $t(`TXT_CODE_INSTANCE_SETTING_${key}_DESC`),
          min: range.min,
          max: range.max
        })),
        {
          key: "instanceStopForceKill",
          type: "boolean",
          title: $t("TXT_CODE_INSTANCE_SETTING_instanceStopForceKill"),
          description: $t("TXT_CODE_INSTANCE_SETTING_instanceStopForceKill_DESC")
        },
        {
          key: "enableSoftShutdown",
          type: "boolean",
          title: $t("TXT_CODE_daemon_enableSoftShutdown"),
          description: $t("TXT_CODE_daemon_enableSoftShutdownInfo")
        },
        {
          key: "softShutdownSkipDocker",
          type: "boolean",
          title: $t("TXT_CODE_daemon_softShutdownSkipDocker"),
          description: $t("TXT_CODE_daemon_softShutdownSkipDockerInfo"),
          visibleWhen: "enableSoftShutdown"
        },
        {
          key: "softShutdownWaitSeconds",
          type: "number",
          title: $t("TXT_CODE_daemon_softShutdownWaitSeconds"),
          description: $t("TXT_CODE_daemon_softShutdownWaitSecondsInfo"),
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
            throw new Error($t(`TXT_CODE_INSTANCE_SETTING_${key}_DESC`));
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
          throw new Error($t("TXT_CODE_daemon_softShutdownWaitSecondsInfo"));
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
