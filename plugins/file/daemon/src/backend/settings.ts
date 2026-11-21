import type { DaemonPluginContext } from "../../../../../core/daemon/src/plugin";

export function registerSettings(ctx: DaemonPluginContext) {
  const config = ctx.settings.config;
  const $t = ctx.i18n.$t;
  const speedOptions = (current: number) =>
    [...new Set([0, 5, 10, 16, 32, 64, 96, 128, 160, 240, 320, 480, current])].map((value) => ({
      value,
      label:
        value === 0
          ? $t("TXT_CODE_COMMON_UNLIMITED")
          : value < 16
          ? `${value * 64}KB/s`
          : `${value / 16}MB/s`
    }));

  ctx.inject(["settingsForm"], (settingsCtx) =>
    settingsCtx.settingsForm.declare({
      defaults: () => ({ ...ctx.settings.defaults() }),
      fields: () => {
        const filePage = { id: "files", title: $t("TXT_CODE_SETTINGS_PAGE_FILES") };
        return [
          {
            key: "uploadSpeedRate",
            page: filePage,
            type: "select",
            title: $t("TXT_CODE_COMMON_USER_FILE_UPLOAD_RATE"),
            description: $t("TXT_CODE_COMMON_LIMIT_PER_HTTP_REQUEST_MAXIMUM_FILE_UPLOAD_SPEED"),
            options: speedOptions(config.uploadSpeedRate)
          },
          {
            key: "downloadSpeedRate",
            page: filePage,
            type: "select",
            title: $t("TXT_CODE_COMMON_USER_FILE_DOWNLOAD_RATE"),
            description: $t("TXT_CODE_COMMON_LIMIT_PER_HTTP_REQUEST_MAXIMUM_FILE_DOWNLOAD_SPEED"),
            options: speedOptions(config.downloadSpeedRate)
          },
          {
            key: "maxDownloadFromUrlFileCount",
            page: filePage,
            type: "number",
            title: $t("TXT_CODE_COMMON_MAXIMUM_OF_DOWNLOAD_FROM_URL"),
            description: $t("TXT_CODE_COMMON_SET_TO_0_TO_UNLIMITED"),
            min: 0
          },
          {
            key: "maxFileEditSizeMiB",
            page: filePage,
            type: "number",
            title: $t("TXT_CODE_FILE_MAX_EDIT_SIZE_MIB"),
            description: $t("TXT_CODE_FILE_MAX_EDIT_SIZE_MIB_DESC"),
            unit: "MiB",
            min: 1
          }
        ];
      },
      read: () => ({
        uploadSpeedRate: config.uploadSpeedRate,
        downloadSpeedRate: config.downloadSpeedRate,
        maxDownloadFromUrlFileCount: config.maxDownloadFromUrlFileCount,
        maxFileEditSizeMiB: config.maxFileEditSizeMiB ?? 5
      }),
      write: (values) => {
        const count = values.maxDownloadFromUrlFileCount;
        if (count != null && (!Number.isInteger(count) || Number(count) < 0)) {
          throw new Error($t("TXT_CODE_COMMON_SET_TO_0_TO_UNLIMITED"));
        }
        const editSize = values.maxFileEditSizeMiB;
        if (editSize !== undefined && (!Number.isSafeInteger(editSize) || Number(editSize) < 1)) {
          throw new Error($t("TXT_CODE_FILE_MAX_EDIT_SIZE_MIB_DESC"));
        }
        if (values.uploadSpeedRate != null) config.uploadSpeedRate = Number(values.uploadSpeedRate);
        if (values.downloadSpeedRate != null)
          config.downloadSpeedRate = Number(values.downloadSpeedRate);
        if (count != null) config.maxDownloadFromUrlFileCount = Number(count);
        if (editSize !== undefined) config.maxFileEditSizeMiB = Number(editSize);
        ctx.settings.save();
      }
    })
  );
}
