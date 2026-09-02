import { ctx as daemon } from "../plugin/context";
import type { DaemonFilesService } from "../plugin/context";

/**
 * How the daemon core reaches instance files.
 *
 * The file subsystem is not core: it belongs to `plugins/file`, which owns
 * the `FileManager`, the chunked uploads, the `file/*` protocol events and the
 * upload/download HTTP routes, and hands the primitives over with
 * `ctx.set("files", ...)`. The core resolves them here, at use time, so that
 * removing the plugin removes the ability to touch instance files with a clear
 * error instead of leaving a stale module-level reference behind.
 *
 * There is deliberately no fallback: a Java installation or an instance creation
 * that cannot write a file has nothing to fall back to.
 */
const MISSING = "Instance file access requires a daemon plugin that provides the file subsystem.";

/**
 * The file primitives. Throws when no plugin provides them.
 *
 * Named like the panel's `remoteSubsystem()` rather than plainly `files`, which
 * collided with the locals several routers already had.
 */
export function fileSubsystem(): DaemonFilesService {
  const service = daemon.get("files");
  if (!service) throw new Error(MISSING);
  return service;
}

/** Whether a file subsystem is installed at all. */
export function hasFileSubsystem(): boolean {
  return Boolean(daemon.get("files"));
}
