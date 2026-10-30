import type { DaemonPluginContext } from "../../../../../core/daemon/src/plugin";

export function registerSettings(ctx: DaemonPluginContext) {
  const config = ctx.settings.config;
  const $t = ctx.i18n.$t;
  ctx.inject(["settingsForm"], (settingsCtx) =>
    settingsCtx.settingsForm.declare({
      fields: () => [
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
        enableSoftShutdown: config.enableSoftShutdown,
        softShutdownSkipDocker: config.softShutdownSkipDocker,
        softShutdownWaitSeconds: config.softShutdownWaitSeconds
      }),
      write: (values) => {
        const seconds = values.softShutdownWaitSeconds;
        if (
          seconds != null &&
          (!Number.isInteger(seconds) || Number(seconds) < 1 || Number(seconds) > 600)
        ) {
          throw new Error($t("TXT_CODE_daemon_softShutdownWaitSecondsInfo"));
        }
        if (values.enableSoftShutdown != null)
          config.enableSoftShutdown = Boolean(values.enableSoftShutdown);
        if (values.softShutdownSkipDocker != null)
          config.softShutdownSkipDocker = Boolean(values.softShutdownSkipDocker);
        if (seconds != null) config.softShutdownWaitSeconds = Number(seconds);
        ctx.settings.save();
      }
    })
  );
}
