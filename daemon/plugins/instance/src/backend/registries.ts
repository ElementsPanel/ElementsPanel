import { Service, type Context } from "cordis";
import { remove } from "cosmokit";
import { AsyncTask, TaskCenter } from "./service/async_task_core";
import type {
  DaemonAsyncTaskRegistration,
  DaemonLifecycleService,
  DaemonLifecycleTaskFactory,
  DaemonPresetCommandFactory,
  DaemonPresetsService,
  DaemonScheduleActionHandler,
  DaemonSchedulesService,
  DaemonTasksService
} from "../../../../src/plugin";

type Preset = string;

function claim<K, V>(ctx: Context, entries: Map<K, V>, kind: string, key: K, value: V) {
  return ctx.effect(() => {
    if (entries.has(key)) throw new Error(`Duplicate daemon ${kind}: ${String(key)}`);
    entries.set(key, value);
    return () => entries.delete(key);
  });
}

export class TasksService extends Service implements DaemonTasksService {
  readonly AsyncTask = AsyncTask;
  readonly Center = TaskCenter;
  private readonly entries = new Map<string, DaemonAsyncTaskRegistration>();
  constructor(ctx: Context) {
    super(ctx, "tasks", true);
    ctx.on("dispose", async () => {
      const tasks = TaskCenter.getTasks();
      await Promise.all(tasks.map((task) => task.stop().catch(() => undefined)));
      TaskCenter.tasks.length = 0;
    });
  }
  register(name: string, registration: DaemonAsyncTaskRegistration) {
    if (!name || !registration?.type || typeof registration.create !== "function") {
      throw new Error("Invalid daemon async task registration");
    }
    return claim(this.ctx, this.entries, "async task", name, registration);
  }
  get(name: string) { return this.entries.get(name); }
}

export class LifecycleService extends Service implements DaemonLifecycleService {
  private readonly factories: DaemonLifecycleTaskFactory[] = [];
  constructor(ctx: Context) { super(ctx, "instanceLifecycle", true); }
  register(factory: DaemonLifecycleTaskFactory) {
    if (typeof factory !== "function") throw new Error("Invalid daemon lifecycle task registration");
    return this.ctx.effect(() => {
      this.factories.push(factory);
      return () => remove(this.factories, factory);
    });
  }
  entries() { return this.factories as readonly DaemonLifecycleTaskFactory[]; }
}

export class PresetsService extends Service implements DaemonPresetsService {
  private readonly factories = new Map<Preset, DaemonPresetCommandFactory>();
  constructor(ctx: Context) { super(ctx, "presets", true); }
  register(preset: Preset, factory: DaemonPresetCommandFactory) {
    if (!preset || typeof factory !== "function") throw new Error("Invalid daemon preset command registration");
    return claim(this.ctx, this.factories, "preset command", preset, factory);
  }
  entries() { return this.factories as ReadonlyMap<Preset, DaemonPresetCommandFactory>; }
}

export class SchedulesService extends Service implements DaemonSchedulesService {
  private readonly handlers = new Map<string, DaemonScheduleActionHandler>();
  constructor(ctx: Context) { super(ctx, "schedules", true); }
  register(actionType: string, handler: DaemonScheduleActionHandler) {
    if (!actionType || typeof handler !== "function") throw new Error("Invalid daemon schedule action registration");
    return claim(this.ctx, this.handlers, "schedule action", actionType, handler);
  }
  get(actionType: string) { return this.handlers.get(actionType); }
}
