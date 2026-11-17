import type { DaemonPluginContext } from "../../../../../core/daemon/src/plugin";

export function registerSettings(ctx: DaemonPluginContext) {
  ctx.inject(["settingsForm"], (settingsCtx) =>
    settingsCtx.settingsForm.declare({
      fields: () => [
        {
          key: "outputBufferSize",
          type: "number",
          title: ctx.i18n.$t("TXT_CODE_DAEMON_OUTPUT_BUFFER_SIZE"),
          description: ctx.i18n.$t("TXT_CODE_DAEMON_OUTPUT_BUFFER_SIZE_INFO"),
          min: 16,
          max: 4096
        }
      ],
      read: () => ({ outputBufferSize: ctx.settings.config.outputBufferSize }),
      write: (values) => {
        const size = values.outputBufferSize;
        if (size != null) {
          if (!Number.isInteger(size) || Number(size) < 16 || Number(size) > 4096) {
            throw new Error(ctx.i18n.$t("TXT_CODE_DAEMON_OUTPUT_BUFFER_SIZE_INFO"));
          }
          ctx.settings.config.outputBufferSize = Number(size);
        }
        ctx.settings.save();
      }
    })
  );
}
