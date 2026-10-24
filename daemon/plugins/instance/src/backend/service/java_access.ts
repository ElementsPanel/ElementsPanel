import { javaManager } from "../runtime";

export function javaManagerSubsystem() {
  const manager = javaManager();
  if (!manager) throw new Error("Instance Java runtime management is not initialized.");
  return manager;
}

export function hasJavaManagerSubsystem() {
  try {
    return Boolean(javaManager());
  } catch {
    return false;
  }
}
