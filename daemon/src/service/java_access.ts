import { ctx as daemon } from "../plugin/context";
import type { DaemonJavaManagerService } from "../plugin/context";

const MISSING =
  "Java runtime management requires a daemon plugin that provides the Java Manager.";

/** Resolves the optional Java Manager plugin at the point an instance needs it. */
export function javaManagerSubsystem(): DaemonJavaManagerService {
  const service = daemon.get("javaManager");
  if (!service) throw new Error(MISSING);
  return service;
}

export function hasJavaManagerSubsystem(): boolean {
  return Boolean(daemon.get("javaManager"));
}
