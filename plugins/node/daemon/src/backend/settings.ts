import type { DaemonPluginContext, DaemonSettingField } from "../../../../../core/daemon/src/plugin";

type RemoteMapping = NonNullable<
  DaemonPluginContext["settings"]["config"]["remoteMappings"]
>[number];

function normalizeMappings(input: unknown): RemoteMapping[] {
  if (!Array.isArray(input) || input.length > 100) throw new Error("Invalid daemon mappings");
  return input.map((entry) => {
    const endpoint = (value: unknown) => {
      if (!value || typeof value !== "object") throw new Error("Invalid daemon mapping address");
      const { ip, port, prefix } = value as RemoteMapping["from"];
      if (
        typeof ip !== "string" ||
        typeof prefix !== "string" ||
        !Number.isInteger(port) ||
        port < 1 ||
        port > 65535
      ) {
        throw new Error("Invalid daemon mapping address");
      }
      return { ip, port, prefix };
    };
    return { from: endpoint(entry?.from), to: endpoint(entry?.to) };
  });
}

export function registerSettings(ctx: DaemonPluginContext) {
  const config = ctx.settings.config;
  const $t = ctx.i18n.$t;
  ctx.inject(["settingsForm"], (settingsCtx) =>
    settingsCtx.settingsForm.declare({
      fields: () => [
        {
          key: "remoteMappings",
          type: "list",
          title: $t("TXT_CODE_bbe23ee7"),
          description: $t("TXT_CODE_497568db"),
          addLabel: $t("TXT_CODE_8d8fbbf4"),
          listEditor: "dialog",
          itemTitleKey: "fromIp",
          maxItems: 100,
          fields: (["from", "to"] as const).flatMap((side): DaemonSettingField[] => {
            const title = $t(side === "from" ? "TXT_CODE_2ee6fd18" : "TXT_CODE_6f27624c");
            return [
              {
                key: `${side}Ip`,
                type: "string",
                title: `${title} · ${$t("TXT_CODE_54312194")}`,
                required: true
              },
              {
                key: `${side}Port`,
                type: "number",
                title: `${title} · ${$t("TXT_CODE_f49149d0")}`,
                min: 1,
                max: 65535,
                required: true
              },
              {
                key: `${side}Prefix`,
                type: "string",
                title: `${title} · ${$t("TXT_CODE_941d83b8")}`
              }
            ];
          })
        }
      ],
      read: () => ({
        remoteMappings: (config.remoteMappings ?? []).map(({ from, to }) => ({
          fromIp: from.ip,
          fromPort: from.port,
          fromPrefix: from.prefix,
          toIp: to.ip,
          toPort: to.port,
          toPrefix: to.prefix
        }))
      }),
      write: (values) => {
        if (values.remoteMappings != null) {
          if (!Array.isArray(values.remoteMappings)) throw new Error("Invalid daemon mappings");
          config.remoteMappings = normalizeMappings(
            values.remoteMappings.map((entry) => ({
              from: { ip: entry?.fromIp, port: entry?.fromPort, prefix: entry?.fromPrefix ?? "" },
              to: { ip: entry?.toIp, port: entry?.toPort, prefix: entry?.toPrefix ?? "" }
            }))
          );
          ctx.settings.save();
        }
      }
    })
  );

  // Null advertises migration support without confusing a deliberately empty list
  // with a node that has never imported its panel-side configuration.
  ctx.overview.provide(() => ({ remoteMappings: config.remoteMappings ?? null }));
  ctx.protocol.on("node/mappings", (routerCtx, data) => {
    try {
      if (config.remoteMappings === undefined) {
        const mappings = normalizeMappings(
          (data as { remoteMappings?: unknown })?.remoteMappings ?? []
        );
        config.remoteMappings = mappings;
        ctx.settings.save();
      }
      ctx.protocol.response(routerCtx, config.remoteMappings);
    } catch (error) {
      ctx.protocol.responseError(routerCtx, error instanceof Error ? error : String(error));
    }
  });
}
