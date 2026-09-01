import { Service, type Context } from "cordis";
import { remove } from "cosmokit";
import type {
  PanelSettingsDeclaration,
  PanelSettingsFormService,
  PanelSettingsSchema
} from "./context";

/**
 * The register of plugin configuration forms.
 *
 * A plugin describes its settings — `ctx.settingsForm.declare({ fields, read,
 * write })` — instead of shipping a component for them. One generic form in
 * `plugins/config` then renders any plugin's configuration, and the same
 * description works for a daemon plugin, whose half of the panel does not exist
 * in the browser at all.
 *
 * `fields()` is called per request rather than once at declaration time: a
 * plugin's titles come from its own translation catalogue, and the panel's
 * language can change while it is running.
 *
 * It is a separate service from `settings` because cordis's `Service` base class
 * already owns the names `config` and `schema`.
 */
export class SettingsFormService extends Service implements PanelSettingsFormService {
  private readonly declarations: Array<{ id: string; declaration: PanelSettingsDeclaration }> = [];

  constructor(ctx: Context) {
    super(ctx, "settingsForm", true);
  }

  declare(declaration: PanelSettingsDeclaration) {
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

  async read(id: string): Promise<PanelSettingsSchema | null> {
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
