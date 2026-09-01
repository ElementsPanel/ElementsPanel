import { Service, type Context } from "cordis";
import { remove } from "cosmokit";
import type {
  DaemonSettingsDeclaration,
  DaemonSettingsFormService,
  DaemonSettingsSchema
} from "./context";

/**
 * The register of plugin configuration forms.
 *
 * A daemon plugin has no browser half, so it cannot ship a component for its
 * settings. It describes them — `ctx.settingsForm.declare({ fields, read, write })`
 * — and the panel's plugin manager renders that description with the same generic
 * form it uses for its own plugins. `plugins/config` is what carries the
 * description there and the values back.
 *
 * `fields()` is called per request rather than once at declaration time: a
 * plugin's titles come from its own catalogue, and the daemon's language changes
 * whenever the panel pushes a new one.
 *
 * It is a separate service from `settings` because cordis's `Service` base class
 * already owns the names `config` and `schema`.
 */
export class SettingsFormService extends Service implements DaemonSettingsFormService {
  private readonly declarations: Array<{ id: string; declaration: DaemonSettingsDeclaration }> = [];

  constructor(ctx: Context) {
    super(ctx, "settingsForm", true);
  }

  declare(declaration: DaemonSettingsDeclaration) {
    // `ctx.name` is the calling plugin, so a form is attributed without the
    // caller repeating its own id.
    const entry = { id: this.ctx.name, declaration };
    return this.ctx.effect(() => {
      this.declarations.push(entry);
      return () => remove(this.declarations, entry);
    });
  }

  declared() {
    return this.declarations.map((entry) => entry.id);
  }

  async read(id: string): Promise<DaemonSettingsSchema | null> {
    const entry = this.declarations.find((item) => item.id === id);
    if (!entry) return null;
    return {
      id,
      fields: entry.declaration.fields(),
      values: await entry.declaration.read()
    };
  }

  async write(id: string, values: Record<string, unknown>) {
    const entry = this.declarations.find((item) => item.id === id);
    if (!entry) throw new Error(`Plugin "${id}" has no configuration to write.`);
    await entry.declaration.write(values);
  }
}
