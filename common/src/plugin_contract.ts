/** Versioned contract shared by the host, plugin compiler and package registry. */
export const PLUGIN_API_VERSION = 1;
export const PLUGIN_SDK_VERSION = "1.0.0";

export interface PluginCompatibility {
  api: number;
  sdk?: number;
}

/** Omitted metadata denotes a legacy package. Unknown versions never execute. */
export function validatePluginCompatibility(value: unknown): void {
  if (value === undefined) return;
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid ElementsPanel plugin compatibility metadata.");
  const contract = value as PluginCompatibility;
  if (contract.api !== PLUGIN_API_VERSION || (contract.sdk !== undefined && contract.sdk !== 1))
    throw new Error(`Unsupported ElementsPanel plugin API/SDK: ${JSON.stringify(value)}`);
}

export type PluginState =
  | "disabled"
  | "pending"
  | "loading"
  | "active"
  | "failed"
  | "unloading"
  | "restart-required";
export interface PluginChangeResult {
  saved: boolean;
  application: "applied" | "pending" | "failed" | "restart-required";
  error?: string;
}

/** A queue survives failures, so a failed change cannot block subsequent repairs. */
export function createPluginQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(operation: () => Promise<T>): Promise<T> => {
    const next = tail.then(operation);
    tail = next.catch(() => undefined);
    return next;
  };
}

export interface PluginSettingField {
  key?: string;
  type: string;
  title?: string;
  min?: number;
  max?: number;
  required?: boolean;
  options?: Array<{ value: unknown }>;
}

/** Validate the form contract on the server before invoking plugin-owned validation. */
export function validatePluginSettings(
  fields: readonly PluginSettingField[],
  values: unknown
): asserts values is Record<string, unknown> {
  if (!values || typeof values !== "object" || Array.isArray(values))
    throw new Error("Invalid plugin settings.");
  const input = values as Record<string, unknown>;
  for (const field of fields) {
    if (!field.key || field.type === "link") continue;
    const value = input[field.key];
    if (value === undefined || value === null) {
      if (field.required) throw new Error(`${field.title || field.key}: required`);
      continue;
    }
    const valid =
      field.type === "number"
        ? typeof value === "number" &&
          Number.isFinite(value) &&
          (field.min === undefined || value >= field.min) &&
          (field.max === undefined || value <= field.max)
        : field.type === "boolean"
        ? typeof value === "boolean"
        : field.type === "select"
        ? field.options?.some((option) => option.value === value)
        : typeof value === "string";
    if (!valid) throw new Error(`${field.title || field.key}: invalid value`);
  }
}
