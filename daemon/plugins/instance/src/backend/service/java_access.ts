import { javaManager } from "../runtime";

export function javaManagerSubsystem() {
  return javaManager();
}

export function hasJavaManagerSubsystem() {
  try {
    return Boolean(javaManager());
  } catch {
    return false;
  }
}
