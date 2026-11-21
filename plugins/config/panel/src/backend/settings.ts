import { validatePluginSettings, type PluginChangeResult } from "mcsmanager-common";
import { Service, type Context } from "cordis";
import { remove } from "cosmokit";
import type {
  PanelSettingsDeclaration,
  PanelSettingsFormService,
  PanelSettingsSchema
} from "../../../../../core/panel/src/app/plugin";

/** Scope each settings declaration to its plugin so unloading removes the form. */
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

  canReset(id: string) {
    const entry = this.declarations.find((item) => item.id === id);
    const fields = entry ? entry.declaration.fields() : this.ctx.plugins.configuration(id).fields;
    return fields.some((field) => field.key && field.type !== "link") &&
      (!entry || Boolean(entry.declaration.defaults || entry.declaration.reset));
  }

  async reset(id: string): Promise<PluginChangeResult> {
    const entry = this.declarations.find((item) => item.id === id);
    if (!entry) return (await this.ctx.plugins.configure(id, null)).result!;
    return this.ctx.plugins.runExclusive(async () => {
      if (entry.declaration.reset) {
        await entry.declaration.reset();
      } else {
        if (!entry.declaration.defaults) throw new Error("Plugin does not provide default settings.");
        const defaults = entry.declaration.defaults();
        const fields = entry.declaration.fields();
        const values: Record<string, unknown> = {};
        for (const field of fields) {
          if (field.key && field.type !== "link") values[field.key] = defaults[field.key];
        }
        validatePluginSettings(fields, values);
        await entry.declaration.write(values);
      }
      return {
        saved: true,
        application: entry.declaration.restartRequired ? "restart-required" : "applied"
      };
    });
  }

  async read(id: string): Promise<PanelSettingsSchema | null> {
    const entry = this.declarations.find((item) => item.id === id);
    if (!entry) {
      const schema = this.ctx.plugins.configuration(id);
      return schema.fields.length ? schema : null;
    }
    return {
      id,
      fields: entry.declaration.fields(),
      values: await entry.declaration.read()
    };
  }

  async write(id: string, values: Record<string, unknown>): Promise<PluginChangeResult> {
    const entry = this.declarations.find((item) => item.id === id);
    if (!entry) return (await this.ctx.plugins.configure(id, values)).result!;
    return this.ctx.plugins.runExclusive(async () => {
      validatePluginSettings(entry.declaration.fields(), values);
      await entry.declaration.write(values);
      return {
        saved: true,
        application: entry.declaration.restartRequired ? "restart-required" : "applied"
      };
    });
  }
}
