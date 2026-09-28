/** Translate persisted window identifiers without importing a feature plugin. */
export function migrateLegacyInstanceWindow<
  T extends { id: string; content: string; instanceId?: string }
>(window: T): T {
  if (window.content === "mc-ping") {
    return { ...window, content: "instance-action:mcstats" };
  }
  if (window.content !== "mod-manager") return window;
  return {
    ...window,
    // Opening the action again must focus the restored window, not duplicate it.
    id: window.instanceId ? `instance-action-mod-manager-${window.instanceId}` : window.id,
    content: "instance-action:mod-manager"
  };
}
