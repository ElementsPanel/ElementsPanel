import type { DaemonPluginContext } from "../../../../../core/daemon/src/plugin";

export function registerSettings(ctx: DaemonPluginContext) {
  const config = ctx.settings.config;
  const $t = ctx.i18n.$t;
  const speedOptions = (current: number) =>
    [...new Set([0, 5, 10, 16, 32, 64, 96, 128, 160, 240, 320, 480, current])].map((value) => ({
      value,
      label:
        value === 0
          ? $t("TXT_CODE_e3a77a77")
          : value < 16
          ? `${value * 64}KB/s`
          : `${value / 16}MB/s`
    }));

  ctx.inject(["settingsForm"], (settingsCtx) =>
    settingsCtx.settingsForm.declare({
      fields: () => [
        {
          key: "uploadSpeedRate",
          type: "select",
          title: $t("TXT_CODE_fde31068"),
          description: $t("TXT_CODE_d8d19932"),
          options: speedOptions(config.uploadSpeedRate)
        },
        {
          key: "downloadSpeedRate",
          type: "select",
          title: $t("TXT_CODE_785a0fcf"),
          description: $t("TXT_CODE_b9fc604c"),
          options: speedOptions(config.downloadSpeedRate)
        },
        {
          key: "maxDownloadFromUrlFileCount",
          type: "number",
          title: $t("TXT_CODE_a15fca22"),
          description: $t("TXT_CODE_ecaf78a2"),
          min: 0
        }
      ],
      read: () => ({
        uploadSpeedRate: config.uploadSpeedRate,
        downloadSpeedRate: config.downloadSpeedRate,
        maxDownloadFromUrlFileCount: config.maxDownloadFromUrlFileCount
      }),
      write: (values) => {
        const count = values.maxDownloadFromUrlFileCount;
        if (count != null && (!Number.isInteger(count) || Number(count) < 0)) {
          throw new Error($t("TXT_CODE_ecaf78a2"));
        }
        if (values.uploadSpeedRate != null) config.uploadSpeedRate = Number(values.uploadSpeedRate);
        if (values.downloadSpeedRate != null)
          config.downloadSpeedRate = Number(values.downloadSpeedRate);
        if (count != null) config.maxDownloadFromUrlFileCount = Number(count);
        ctx.settings.save();
      }
    })
  );
}
