import { Service, type Context } from "cordis";
import { remove } from "cosmokit";
import type { IPresetCommand } from "../entity/commands/dispatcher";
import type {
  DaemonLifecycleService,
  DaemonLifecycleTaskFactory,
  DaemonAsyncTaskRegistration,
  DaemonFeaturesService,
  DaemonOverviewProvider,
  DaemonOverviewService,
  DaemonPresetCommandFactory,
  DaemonPresetsService,
  DaemonScheduleActionHandler,
  DaemonSchedulesService,
  DaemonTasksService
} from "./context";
import { AsyncTask, TaskCenter } from "../service/async_task_service";

/**
 * The daemon's extension points.
 *
 * These were module-level registries that no scope owned, so nothing a plugin
 * registered could ever be taken back. Registration is an effect now: each entry
 * belongs to the plugin that added it, duplicates still throw, and the core
 * consumers below stay registry-driven with no knowledge of any one plugin.
 */

/** Registers `value` under `key`, undone when the calling plugin unloads. */
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
  }

  register(taskName: string, registration: DaemonAsyncTaskRegistration) {
    if (!taskName || !registration?.type || typeof registration.create !== "function") {
      throw new Error("Invalid daemon async task registration");
    }
    return claim(this.ctx, this.entries, "async task", taskName, registration);
  }

  get(taskName: string) {
    return this.entries.get(taskName);
  }
}

export class LifecycleService extends Service implements DaemonLifecycleService {
  private readonly factories: DaemonLifecycleTaskFactory[] = [];

  constructor(ctx: Context) {
    super(ctx, "instanceLifecycle", true);
  }

  register(factory: DaemonLifecycleTaskFactory) {
    if (typeof factory !== "function") throw new Error("Invalid daemon lifecycle task registration");
    return this.ctx.effect(() => {
      this.factories.push(factory);
      return () => remove(this.factories, factory);
    });
  }

  entries(): readonly DaemonLifecycleTaskFactory[] {
    return this.factories;
  }
}

export class PresetsService extends Service implements DaemonPresetsService {
  private readonly factories = new Map<IPresetCommand, DaemonPresetCommandFactory>();

  constructor(ctx: Context) {
    super(ctx, "presets", true);
  }

  register(preset: IPresetCommand, factory: DaemonPresetCommandFactory) {
    if (!preset || typeof factory !== "function") {
      throw new Error("Invalid daemon preset command registration");
    }
    return claim(this.ctx, this.factories, "preset command", preset, factory);
  }

  entries(): ReadonlyMap<IPresetCommand, DaemonPresetCommandFactory> {
    return this.factories;
  }
}

export class SchedulesService extends Service implements DaemonSchedulesService {
  private readonly handlers = new Map<string, DaemonScheduleActionHandler>();

  constructor(ctx: Context) {
    super(ctx, "schedules", true);
  }

  register(actionType: string, handler: DaemonScheduleActionHandler) {
    if (!actionType || typeof handler !== "function") {
      throw new Error("Invalid daemon schedule action registration");
    }
    return claim(this.ctx, this.handlers, "schedule action", actionType, handler);
  }

  get(actionType: string) {
    return this.handlers.get(actionType);
  }
}

export class FeaturesService extends Service implements DaemonFeaturesService {
  private readonly features = new Map<string, boolean>();

  constructor(ctx: Context) {
    super(ctx, "features", true);
  }

  add(feature: string) {
    if (!feature) throw new Error("Invalid daemon feature registration");
    return claim(this.ctx, this.features, "feature", feature, true);
  }

  has(feature: string) {
    return this.features.get(feature) === true;
  }

  all() {
    return Object.fromEntries(this.features);
  }
}

export class OverviewService extends Service implements DaemonOverviewService {
  private readonly providers = new Set<DaemonOverviewProvider>();

  constructor(ctx: Context) {
    super(ctx, "overview", true);
  }

  provide(provider: DaemonOverviewProvider) {
    if (typeof provider !== "function") throw new Error("Invalid daemon overview provider");
    return this.ctx.effect(() => {
      this.providers.add(provider);
      return () => this.providers.delete(provider);
    });
  }

  /**
   * Merge every provider's fields into the payload. A provider that throws is
   * skipped and reported: one broken extra must not make this daemon unreadable
   * to the panel.
   */
  async collect() {
    const extras: Record<string, unknown> = {};
    for (const provider of this.providers) {
      try {
        Object.assign(extras, await provider());
      } catch (error) {
        this.ctx.logger("overview").warn("An overview provider failed:", error);
      }
    }
    return extras;
  }
}
