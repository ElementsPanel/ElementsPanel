import { ctx as panel } from "../plugin/context";
import type {
  PanelRemoteNode,
  PanelRemoteRequest,
  PanelRemoteService,
  PanelRemoteSubsystem
} from "../plugin/context";

/**
 * How the panel core reaches its daemons.
 *
 * The remote-node subsystem is not core: it belongs to `plugins/node`, which
 * owns the connections, their stored configuration and the request helper, and
 * hands the whole thing over with `ctx.set("remote", ...)`. The core resolves it
 * here, at use time, so that removing the plugin removes daemon connectivity
 * with a clear error instead of leaving a stale module-level reference behind.
 *
 * There is deliberately no fallback. Unlike the request guard — where "nobody is
 * guarding this panel" is a meaningful state — there is no sensible stand-in for
 * "no daemons": a route that cannot reach one has nothing to answer with.
 */
const MISSING = "Daemon connectivity requires a panel plugin that provides the node subsystem.";

function remote(): PanelRemoteService {
  const service = panel.get("remote");
  if (!service) throw new Error(MISSING);
  return service;
}

/** Whether a node subsystem is installed at all. */
export function hasRemoteSubsystem(): boolean {
  return Boolean(panel.get("remote"));
}

/** The set of daemon nodes. Throws when no plugin provides one. */
export function remoteSubsystem(): PanelRemoteSubsystem {
  return remote().services;
}

/** One request/response round trip to `node`, over the socket it holds open. */
export function remoteRequest(node?: PanelRemoteNode): PanelRemoteRequest {
  const Request = remote().Request;
  return new Request(node);
}

/**
 * Whether `error` is the timeout a daemon request throws. The class belongs to
 * the plugin, so `instanceof` has to go through the installed one.
 */
export function isRemoteRequestTimeout(error: unknown): boolean {
  const service = panel.get("remote");
  return Boolean(service) && error instanceof service!.RequestTimeoutError;
}
