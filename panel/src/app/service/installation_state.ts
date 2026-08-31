import { ctx as panel } from "../plugin/context";
import type { PanelInstallationService } from "../plugin/context";

/**
 * `/api/auth/status` reports whether first-run setup is complete.
 * `plugins/oobe` provides `ctx.installation`; the core defaults to installed, so
 * removing that plugin cannot redirect the frontend to a route that no longer
 * exists.
 */
const INSTALLED: PanelInstallationService = {
  isInstalled: () => true
};

export function getInstallationState(): PanelInstallationService {
  return panel.get("installation") ?? INSTALLED;
}
