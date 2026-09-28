import { Service, type Context } from "cordis";
import { markRaw, shallowRef, type Component } from "vue";
import type {
  FrontendSlotsService,
  PanelFrontendSlotEntry,
  PanelFrontendSlotName,
  PanelFrontendSlotProps,
  PanelFrontendSlotRegistration
} from "@/plugin/context";

interface StoredSlotEntry<K extends PanelFrontendSlotName = PanelFrontendSlotName>
  extends PanelFrontendSlotEntry<K> {
  condition?: (props: PanelFrontendSlotProps<K>) => boolean;
}

/** Effect-scoped, typed UI extension seats owned by the console shell. */
export class SlotsService extends Service implements FrontendSlotsService {
  private readonly registrations = new Map<PanelFrontendSlotName, StoredSlotEntry[]>();
  private readonly revision = shallowRef(0);
  private sequence = 0;

  constructor(ctx: Context) {
    super(ctx, "slots", true);
  }

  register<K extends PanelFrontendSlotName>(
    name: K,
    component: Component,
    options: PanelFrontendSlotRegistration<K> = {}
  ) {
    const owner = this.ctx.name || "anonymous";
    const id = (options.id || `${owner}:${++this.sequence}`).trim();
    if (!id) throw new Error(`Slot registration in "${name}" needs an id.`);
    const entry: StoredSlotEntry<K> = {
      id,
      owner,
      name,
      component: markRaw(component),
      order: Number.isFinite(options.order) ? Number(options.order) : 0,
      props: { ...(options.props || {}) },
      condition: options.condition
    };
    return this.ctx.effect(() => {
      const bucket = this.registrations.get(name) || [];
      if (bucket.some((candidate) => candidate.id === id)) {
        throw new Error(`Duplicate slot registration "${name}:${id}".`);
      }
      bucket.push(entry as unknown as StoredSlotEntry);
      this.registrations.set(name, bucket);
      this.revision.value += 1;
      return () => {
        const current = this.registrations.get(name);
        if (!current) return;
        const index = current.indexOf(entry as unknown as StoredSlotEntry);
        if (index >= 0) current.splice(index, 1);
        if (!current.length) this.registrations.delete(name);
        this.revision.value += 1;
      };
    });
  }

  entries<K extends PanelFrontendSlotName>(name: K, props: PanelFrontendSlotProps<K>) {
    void this.revision.value;
    return (this.registrations.get(name) || [])
      .filter((entry) => {
        try {
          return !entry.condition || entry.condition(props as never);
        } catch (error) {
          this.ctx.logger("slots").warn(`Slot condition failed: ${name}:${entry.id}`, error);
          return false;
        }
      })
      .slice()
      .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)) as PanelFrontendSlotEntry<K>[];
  }
}
