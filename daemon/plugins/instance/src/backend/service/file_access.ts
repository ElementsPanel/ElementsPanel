import { files } from "../runtime";

export function fileSubsystem() {
  const service = files();
  if (!service) throw new Error("Instance file access requires the file plugin.");
  return service;
}

export function hasFileSubsystem() {
  try {
    return Boolean(files());
  } catch {
    return false;
  }
}
