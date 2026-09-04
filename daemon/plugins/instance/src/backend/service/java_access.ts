import { javaManager } from "../runtime";

export function javaManagerSubsystem() {
  const manager = javaManager();
  if (!manager) throw new Error("Java runtime management requires the Java plugin.");
  return manager;
}

export function hasJavaManagerSubsystem() {
  try {
    return Boolean(javaManager());
  } catch {
    return false;
  }
}
