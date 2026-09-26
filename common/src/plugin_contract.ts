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

export interface PluginDependencyIssue {
  type: "missing-dependency" | "dependency-cycle" | "dependency-unavailable";
  dependencies: readonly string[];
  message: string;
}

export interface PluginDependencyOrder<T> {
  ordered: T[];
  issues: Map<string, PluginDependencyIssue>;
}

/**
 * Stable topological ordering shared by plugin hosts.
 *
 * Invalid nodes are kept out of `ordered`: direct missing dependencies are
 * reported first, then anything depending on an invalid node, and finally
 * cycles (plus nodes blocked behind a cycle). Independent nodes retain the
 * caller's priority/id comparator.
 */
export function resolvePluginDependencyOrder<T>(
  items: readonly T[],
  options: {
    id(item: T): string;
    dependencies(item: T): readonly string[] | undefined;
    compare(a: T, b: T): number;
  }
): PluginDependencyOrder<T> {
  const sorted = [...items].sort(options.compare);
  const byId = new Map(sorted.map((item) => [options.id(item), item]));
  const dependencies = new Map(
    sorted.map((item) => [
      options.id(item),
      [...new Set(options.dependencies(item) || [])].filter(Boolean)
    ])
  );
  const issues = new Map<string, PluginDependencyIssue>();

  for (const item of sorted) {
    const id = options.id(item);
    const missing = dependencies.get(id)!.filter((dependency) => !byId.has(dependency));
    if (!missing.length) continue;
    issues.set(id, {
      type: "missing-dependency",
      dependencies: missing,
      message: `Missing frontend plugin dependencies: ${missing.join(", ")}`
    });
  }

  const markUnavailable = () => {
    let changed = false;
    for (const item of sorted) {
      const id = options.id(item);
      if (issues.has(id)) continue;
      const unavailable = dependencies.get(id)!.filter((dependency) => issues.has(dependency));
      if (!unavailable.length) continue;
      issues.set(id, {
        type: "dependency-unavailable",
        dependencies: unavailable,
        message: `Frontend plugin dependencies are unavailable: ${unavailable.join(", ")}`
      });
      changed = true;
    }
    return changed;
  };
  while (markUnavailable()) {
    // Propagate direct graph failures before sorting the remaining nodes.
  }

  const candidates = sorted.filter((item) => !issues.has(options.id(item)));
  const candidateIds = new Set(candidates.map(options.id));
  const indegree = new Map(candidates.map((item) => [options.id(item), 0]));
  const dependents = new Map<string, T[]>();
  for (const item of candidates) {
    const id = options.id(item);
    for (const dependency of dependencies.get(id)!) {
      if (!candidateIds.has(dependency)) continue;
      indegree.set(id, indegree.get(id)! + 1);
      const bucket = dependents.get(dependency) || [];
      bucket.push(item);
      dependents.set(dependency, bucket);
    }
  }

  const ready = candidates.filter((item) => indegree.get(options.id(item)) === 0);
  ready.sort(options.compare);
  const ordered: T[] = [];
  while (ready.length) {
    const item = ready.shift()!;
    const id = options.id(item);
    ordered.push(item);
    for (const dependent of dependents.get(id) || []) {
      const dependentId = options.id(dependent);
      const next = indegree.get(dependentId)! - 1;
      indegree.set(dependentId, next);
      if (next === 0) {
        ready.push(dependent);
        ready.sort(options.compare);
      }
    }
  }

  const unresolved = candidates.filter((item) => !ordered.includes(item));
  if (unresolved.length) {
    const unresolvedIds = new Set(unresolved.map(options.id));
    for (const item of unresolved) {
      const id = options.id(item);
      const blockedBy = dependencies.get(id)!.filter((dependency) => unresolvedIds.has(dependency));
      issues.set(id, {
        type: "dependency-cycle",
        dependencies: blockedBy,
        message: `Frontend plugin dependency cycle: ${[id, ...blockedBy].join(" -> ")}`
      });
    }
  }

  return { ordered, issues };
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
