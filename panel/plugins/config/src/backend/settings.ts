import { Service, type Context } from "cordis";
import { remove } from "cosmokit";
import type {
  PanelSettingsDeclaration,
  PanelSettingsFormService,
  PanelSettingsSchema
} from "../../../../src/app/plugin";

/**
 * The configuration registry belongs to the config plugin. A declaration is
 * scoped to the plugin that made it, so unloading that plugin removes its form
 * without leaving stale entries in the settings page.
 */
export class SettingsFormService extends Service implements PanelSettingsFormService {
  private readonly declarations: Array<{ id: string; declaration: PanelSettingsDeclaration }> = [];

  constructor(ctx: Context) {
    super(ctx, "settingsForm", true);
  }

  declare(declaration: PanelSettingsDeclaration) {
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
    if (!entry) throw new Error(`Plugin has no settings declaration: ${id}`);
    await entry.declaration.write(values);
  }
}
