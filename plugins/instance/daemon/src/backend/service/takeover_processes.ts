import { ChildProcessAdapter, instanceProcessHost } from "../entity/commands/base/process_adapter";
import { GoPtyProcessAdapter } from "../entity/commands/pty/pty_start";
import InstanceSubsystem from "./system_instance";

/** Reattach the launcher's live pipes; do not execute the instance start command. */
export default async function takeoverProcesses(isActive = () => true) {
  const host = instanceProcessHost();
  if (!host) return;
  for (const snapshot of await host.list()) {
    if (!isActive()) return;
    const instance = InstanceSubsystem.getInstance(snapshot.id);
    const child = host.connect(snapshot);
    const { pipeName, pid } = snapshot.metadata;
    const adapter = pipeName
      ? new GoPtyProcessAdapter(child, pid, pipeName)
      : new ChildProcessAdapter(child);
    if (!instance || instance.process) {
      await adapter.destroy();
      continue;
    }
    instance.started(adapter, snapshot.metadata);
    if (pipeName) adapter.attachOutput();
  }
}
