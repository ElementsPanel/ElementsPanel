import { validatePluginSettings, type PluginChangeResult, type PluginSettingField } from "mcsmanager-common";

interface SettingsDeclaration {
  restartRequired?: boolean;
  fields(): PluginSettingField[];
  read(): Record<string, unknown> | Promise<Record<string, unknown>>;
  write(values: Record<string, unknown>): void | Promise<void>;
  defaults?(): Record<string, unknown>;
  reset?(): void | Promise<void>;
}

function fieldValues(fields: PluginSettingField[], values: Record<string, unknown>) {
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.key && field.type !== "link" && Object.prototype.hasOwnProperty.call(values, field.key))
      result[field.key] = values[field.key];
  }
  return result;
}

async function applyDeclarations(
  forms: SettingsDeclaration[],
  operations: Array<() => void | Promise<void>>,
  snapshot?: Record<string, unknown>[]
): Promise<PluginChangeResult> {
  const previous = snapshot ?? (forms.length > 1 ? await Promise.all(forms.map((form) => form.read())) : []);
  let attempted = 0;
  try {
    for (const operation of operations) {
      attempted++;
      await operation();
    }
  } catch (error) {
    // Restore earlier sections if a later writer rejects the combined form.
    for (let index = previous.length ? attempted - 1 : -1; index >= 0; index--) {
      try {
        await forms[index].write(previous[index]);
      } catch (rollbackError) {
        console.error("Failed to restore plugin settings:", rollbackError);
      }
    }
    throw error;
  }
  return {
    saved: true,
    application: forms.some((form) => form.restartRequired) ? "restart-required" : "applied"
  };
}

export async function writeSettingsDeclarations(forms: SettingsDeclaration[], values: Record<string, unknown>) {
  const sections = forms.map((form) => {
    const fields = form.fields();
    validatePluginSettings(fields, values);
    const selected = forms.length > 1 ? fieldValues(fields, values) : values;
    return { form, fields, selected };
  });
  const previous = forms.length > 1 ? await Promise.all(forms.map((form) => form.read())) : undefined;
  const changed = sections.map((section, index) => ({ ...section, previous: previous?.[index] }))
    .filter((section) => !previous || Object.keys(section.selected).some((key) =>
      JSON.stringify(section.previous![key]) !== JSON.stringify(section.selected[key])
    ));
  return applyDeclarations(
    changed.map((section) => section.form),
    changed.map(({ form, selected }) => () => form.write(selected)),
    previous ? changed.map((section) => section.previous!) : undefined
  );
}

export function resetSettingsDeclarations(forms: SettingsDeclaration[]) {
  const operations = forms.map((form) => {
    if (form.reset) return () => form.reset!();
    if (!form.defaults) throw new Error("Plugin does not provide default settings.");
    const fields = form.fields();
    const values = fieldValues(fields, form.defaults());
    validatePluginSettings(fields, values);
    return () => form.write(values);
  });
  return applyDeclarations(forms, operations);
}
