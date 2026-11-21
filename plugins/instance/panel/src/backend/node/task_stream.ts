/** Keep task-stream forwarding separate to avoid an import cycle with remote entities. */

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

/** Admins see all tasks; users see assigned instances only, and host tasks remain admin-only. */
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
