import { type PluginChangeResult } from "mcsmanager-common";
import { Service, type Context } from "cordis";
import { remove } from "cosmokit";
import { resetSettingsDeclarations, settingsFields, writeSettingsDeclarations } from "../../../shared/settings";
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
    return [...new Set(this.declarations.map((entry) => entry.id))];
  }

  private forms(id: string) {
    return this.declarations.filter((entry) => entry.id === id).map((entry) => entry.declaration);
  }

  canReset(id: string) {
    const forms = this.forms(id);
    const fields = forms.length ? settingsFields(forms) : this.ctx.plugins.configuration(id).fields;
    return fields.some((field) => field.key && field.type !== "link") &&
      forms.every((form) => Boolean(form.defaults || form.reset));
  }

  async reset(id: string): Promise<PluginChangeResult> {
    const forms = this.forms(id);
    if (!forms.length) return (await this.ctx.plugins.configure(id, null)).result!;
    return this.ctx.plugins.runExclusive(() => resetSettingsDeclarations(forms));
  }

  async read(id: string): Promise<PanelSettingsSchema | null> {
    const forms = this.forms(id);
    if (!forms.length) {
      const schema = this.ctx.plugins.configuration(id);
      return schema.fields.length ? schema : null;
    }
    return {
      id,
      fields: settingsFields(forms),
      values: Object.assign({}, ...await Promise.all(forms.map((form) => form.read())))
    };
  }

  async write(id: string, values: Record<string, unknown>): Promise<PluginChangeResult> {
    const forms = this.forms(id);
    if (!forms.length) return (await this.ctx.plugins.configure(id, values)).result!;
    return this.ctx.plugins.runExclusive(() => writeSettingsDeclarations(forms, values));
  }
}
