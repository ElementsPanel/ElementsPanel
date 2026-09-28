import { validatePluginSettings, type PluginChangeResult } from "mcsmanager-common";
import { Service, type Context } from "cordis";
import { remove } from "cosmokit";
import type {
  DaemonSettingsDeclaration,
  DaemonSettingsFormService,
  DaemonSettingsSchema
} from "../../../../src/plugin";

/** Configuration declarations are owned by the daemon config plugin. */
export class SettingsFormService extends Service implements DaemonSettingsFormService {
  private readonly declarations: Array<{ id: string; declaration: DaemonSettingsDeclaration }> = [];

  constructor(ctx: Context) {
    super(ctx, "settingsForm", true);
  }

  declare(declaration: DaemonSettingsDeclaration) {
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
    if (!entry) {
      const schema = this.ctx.plugins.configuration(id);
      return schema.fields.length ? schema : null;
    }
    return { id, fields: entry.declaration.fields(), values: await entry.declaration.read() };
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
