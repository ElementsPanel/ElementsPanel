import type { DaemonPluginContext } from "../../../../../../core/daemon/src/plugin";
import { registerSettings } from "./settings";

// Keep this helper local to avoid depending on the host bundle layout.
function isEmpty(value: unknown) {
  return value === null || value === undefined;
}

function toText(value: unknown): string | null {
  if (isEmpty(value)) return null;
  return String(value);
}

function toNumber(value: unknown): number | null {
  if (isEmpty(value)) return null;
  if (isNaN(Number(value))) return null;
  return Number(value);
}

export function apply(ctx: DaemonPluginContext) {
  registerSettings(ctx);
  ctx.protocol.on("info/setting", async (routerCtx: any, data: any) => {
    const config = ctx.settings.config;
    const payload = data || {};

    const language = toText(payload.language);
    const portRangeStart = toNumber(payload.portRangeStart);
    const portRangeEnd = toNumber(payload.portRangeEnd);
    const portAssignInterval = toNumber(payload.portAssignInterval);

    if (language && config.followPanelLanguage !== false) {
      ctx.settings.setLanguage(language);
    }
    if (portRangeStart != null && portRangeEnd != null && portRangeStart < portRangeEnd) {
      config.allocatablePortRange = [portRangeStart, portRangeEnd];
      config.currentAllocatablePort = portRangeStart;
    }
    if (portAssignInterval != null && portAssignInterval > 0) {
      config.portAssignInterval = portAssignInterval;
    }

    ctx.settings.save();
    ctx.protocol.response(routerCtx, true);
  });
}
