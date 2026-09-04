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
    if (!entry) return null;
    return { id, fields: entry.declaration.fields(), values: await entry.declaration.read() };
  }

  async write(id: string, values: Record<string, unknown>) {
    const entry = this.declarations.find((item) => item.id === id);
    if (!entry) throw new Error(`Plugin "${id}" has no configuration to write.`);
    await entry.declaration.write(values);
  }
}
