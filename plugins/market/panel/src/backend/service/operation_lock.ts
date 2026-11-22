// Serialize install and uninstall to prevent concurrent project-manifest writes.
const pluginOperations = new Map<string, Promise<void>>();
export async function withPluginLock<T>(pluginId: string, operation: () => Promise<T>): Promise<T> {
  const previous = pluginOperations.get(pluginId) ?? Promise.resolve();
  const result = previous.then(operation);
  const settled = result.then(
    () => {},
    () => {}
  );
  pluginOperations.set(pluginId, settled);
  try {
    return await result;
  } finally {
    if (pluginOperations.get(pluginId) === settled) pluginOperations.delete(pluginId);
  }
}

export function withPluginLocks<T>(pluginIds: string[], operation: () => Promise<T>): Promise<T> {
  const ids = [...new Set(pluginIds)].sort();
  const acquire = (index: number): Promise<T> =>
    index === ids.length ? operation() : withPluginLock(ids[index], () => acquire(index + 1));
  return acquire(0);
}
