/**
 * The bridge between daemon task pushes and the panel's browser sockets.
 *
 * `RemoteService` publishes daemon snapshots here, and the node plugin installs
 * one sink that owns the Socket.IO forwarding. Keeping the sink in a tiny module
 * avoids a dependency cycle between the remote entities and the plugin entry.
 */

export interface TaskStreamTask {
  id: string;
  instanceUuid?: string;
  [key: string]: unknown;
}

export interface TaskStreamPayload {
  owner: string;
  tasks: TaskStreamTask[];
}

export interface TaskStreamSink {
  tasks(daemonId: string, nodeName: string, data: TaskStreamPayload): void;
  availability(): void;
}

export interface TaskStreamUser {
  /** Panel roles: 10 is an administrator. */
  permission: number;
  instances?: Array<{ daemonId: string; instanceUuid: string }>;
}

let sink: TaskStreamSink | undefined;

export function setTaskStreamSink(next?: TaskStreamSink) {
  sink = next;
}

export function publishTasks(daemonId: string, nodeName: string, data: unknown) {
  const payload = data as TaskStreamPayload | undefined;
  if (!payload || typeof payload.owner !== "string" || !Array.isArray(payload.tasks)) return;
  sink?.tasks(daemonId, nodeName, payload);
}

export function publishAvailability() {
  sink?.availability();
}

/**
 * Mirrors the HTTP route's visibility rules: administrators see every task,
 * while a regular user only sees tasks of the instances assigned to them. A
 * task without an instance belongs to the panel itself and stays admin-only.
 */
export function visibleTasks(
  daemonId: string,
  tasks: TaskStreamTask[],
  user: TaskStreamUser | undefined | null
): TaskStreamTask[] {
  if (!user) return [];
  if (user.permission >= 10) return tasks;
  const allowed = new Set(
    (user.instances || []).map((item) => `${item.daemonId}:${item.instanceUuid}`)
  );
  return tasks.filter(
    (task) => !!task.instanceUuid && allowed.has(`${daemonId}:${task.instanceUuid}`)
  );
}
