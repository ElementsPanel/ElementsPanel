import type { PanelPluginContext } from "../../../../src/app/plugin";
import { registerFileRoutes } from "./file_router";
import { setPluginContext } from "./runtime";

// Panel side of the file manager. It owns every route the file manager UI talks
// to; the bytes themselves never pass through here — each route forwards to the
// daemon that holds the instance, over the node subsystem.
//
// The daemon half is `daemon/plugins/file`, which owns the `file/*`
// protocol events and the upload/download HTTP routes these forward to.

export const inject = [
  "koa",
  "i18n",
  "middleware",
  "roles",
  "remote",
  "identity",
  "operations"
];

export function apply(ctx: PanelPluginContext) {
  setPluginContext(ctx);
  // No catalogue of its own: the two strings these routes answer with — the
  // "file manager is off" refusal and the instance-forbidden one — are both
  // shared with the core (`mod_manager_router`, the permission middleware), so
  // they stay in the root catalogue.
  registerFileRoutes();
}
