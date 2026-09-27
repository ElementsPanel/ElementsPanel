<script setup lang="ts">
/* eslint-disable vue/no-mutating-props */
import { t } from "@/lang/i18n";
import type { FrontendFileManagerService } from "@/plugin";
import { usePluginService } from "@/plugin/context";
import { router } from "@/config/router";
import { computed, reactive } from "vue";
import { VBtn, VForm, VSelect, VTextField, VTextarea } from "vuetify/components";
import type { SettingField } from "./api";

// The one form that renders every plugin's configuration. It knows nothing about
// any particular plugin: the fields arrive from the backend that declared them,
// with their labels already translated, which is what lets the same component
// render a daemon plugin's settings 鈥?the browser holds no copy of a daemon
// plugin at all.

const props = defineProps<{
  fields: SettingField[];
  values: Record<string, unknown>;
  nested?: boolean;
}>();

// The event parameter is part of the emit type only; Vue supplies no runtime
// value for it.
// eslint-disable-next-line no-unused-vars
const emit = defineEmits<{ (event: "save"): void }>();

const allYesNo = [
  { label: t("TXT_CODE_52c8a730"), value: true },
  { label: t("TXT_CODE_718c9310"), value: false }
];

/**
 * A field is hidden unless every condition holds. A condition is either a field
 * name 鈥?true when that field is truthy 鈥?or `"name=value"`.
 */
const visible = (field: SettingField) => {
  const conditions = field.visibleWhen;
  if (!conditions) return true;
  const list = Array.isArray(conditions) ? conditions : [conditions];
  return list.every((condition) => {
    const [key, expected] = condition.split("=");
    const value = props.values[key];
    return expected === undefined ? Boolean(value) : String(value ?? "") === expected;
  });
};

const fileManager = computed(() => usePluginService<FrontendFileManagerService>("file"));

const uploading = reactive(new Set<string>());

const set = (field: SettingField, value: unknown) => {
  if (field.key) props.values[field.key] = value;
};

const setNumber = (field: SettingField, value: string | number | null) => {
  if (!field.key) return;
  props.values[field.key] = value === "" || value === null ? undefined : Number(value);
};

const items = (field: SettingField): Record<string, unknown>[] =>
  Array.isArray(props.values[field.key!])
    ? (props.values[field.key!] as Record<string, unknown>[])
    : [];
const addItem = (field: SettingField) => {
  if (items(field).length >= (field.maxItems ?? 100)) return;
  const item = Object.fromEntries(
    (field.fields || [])
      .filter((child) => child.key && child.type !== "link")
      .map((child) => [
        child.key!,
        child.type === "boolean"
          ? false
          : child.type === "list"
          ? []
          : child.type === "number"
          ? child.min ?? 0
          : ""
      ])
  );
  set(field, [...items(field), item]);
};
const removeItem = (field: SettingField, index: number) =>
  set(
    field,
    items(field).filter((_, itemIndex) => itemIndex !== index)
  );

const upload = async (field: SettingField) => {
  if (!field.key || uploading.has(field.key)) return;
  const file = fileManager.value;
  if (!file) return;
  uploading.add(field.key);
  try {
    const url = await file.useUploadFileDialog();
    if (url) set(field, url);
  } finally {
    uploading.delete(field.key);
  }
};

const open = (field: SettingField) => {
  if (!field.route) return;
  const [path, query] = field.route.split("?");
  router.push({
    path,
    query: query ? Object.fromEntries(new URLSearchParams(query)) : {}
  });
};
</script>

<template>
  <component :is="nested ? 'div' : VForm" @submit.prevent="emit('save')">
    <template v-for="(field, index) in fields" :key="field.key || `link-${index}`">
      <div v-if="field.type === 'link'" class="setting-link-row">
        <VBtn variant="outlined" type="button" @click="open(field)">{{ field.title }}</VBtn>
      </div>

      <div v-else-if="visible(field)" class="setting-field">
        <div class="setting-field-title">{{ field.title }}</div>
        <div v-if="field.description" class="setting-field-description">
          {{ field.description }}
        </div>

        <div v-if="field.type === 'list'" class="setting-list">
          <section
            v-for="(item, itemIndex) in items(field)"
            :key="itemIndex"
            class="setting-list-item"
          >
            <div class="setting-list-header">
              <strong>{{
                String(item[field.itemTitleKey || "name"] || `${field.title} ${itemIndex + 1}`)
              }}</strong>
              <VBtn
                type="button"
                icon="mdi-delete-outline"
                variant="text"
                size="small"
                :aria-label="field.removeLabel || t('TXT_CODE_6f2c1806')"
                @click="removeItem(field, itemIndex)"
              />
            </div>
            <SchemaForm :fields="field.fields || []" :values="item" nested />
          </section>
          <VBtn
            type="button"
            prepend-icon="mdi-plus"
            variant="tonal"
            :disabled="items(field).length >= (field.maxItems ?? 100)"
            @click="addItem(field)"
          >
            {{ field.addLabel || t("TXT_CODE_a1d885c1") }}
          </VBtn>
        </div>
        <VTextarea
          v-else-if="field.type === 'text'"
          :model-value="String(values[field.key!] ?? '')"
          :rows="4"
          :placeholder="field.placeholder || t('TXT_CODE_4ea93630')"
          variant="solo-filled"
          density="comfortable"
          hide-details
          @update:model-value="set(field, $event)"
        />
        <div
          v-else-if="field.type === 'string' && !field.secret && field.fileUpload"
          class="setting-file-input"
        >
          <VTextField
            :model-value="String(values[field.key!] ?? '')"
            :placeholder="field.placeholder || t('TXT_CODE_4ea93630')"
            variant="solo-filled"
            density="comfortable"
            hide-details
            clearable
            @update:model-value="set(field, $event)"
          />
          <VBtn
            v-if="fileManager"
            type="button"
            variant="outlined"
            :loading="field.key ? uploading.has(field.key) : false"
            @click="upload(field)"
          >
            {{ t("TXT_CODE_ae09d79d") }}
          </VBtn>
        </div>
        <VTextField
          v-else-if="field.type === 'string' && !field.secret"
          :model-value="String(values[field.key!] ?? '')"
          class="setting-control setting-control-medium"
          :placeholder="field.placeholder || t('TXT_CODE_4ea93630')"
          variant="solo-filled"
          density="comfortable"
          hide-details
          @update:model-value="set(field, $event)"
        />
        <VTextField
          v-else-if="field.type === 'string'"
          :model-value="String(values[field.key!] ?? '')"
          class="setting-control setting-control-medium"
          type="password"
          autocomplete="new-password"
          :placeholder="field.placeholder || t('TXT_CODE_4ea93630')"
          variant="solo-filled"
          density="comfortable"
          hide-details
          @update:model-value="set(field, $event)"
        />
        <VTextField
          v-else-if="field.type === 'number'"
          :model-value="Number(values[field.key!] ?? 0)"
          class="setting-control setting-control-small"
          type="number"
          :min="field.min"
          :max="field.max"
          variant="solo-filled"
          density="comfortable"
          hide-details
          @update:model-value="setNumber(field, $event)"
        />
        <VSelect
          v-else-if="field.type === 'boolean'"
          :model-value="Boolean(values[field.key!])"
          class="setting-control setting-control-small"
          :items="allYesNo"
          item-title="label"
          item-value="value"
          hide-details
          @update:model-value="set(field, $event)"
        />
        <VSelect
          v-else-if="field.type === 'select'"
          :model-value="values[field.key!]"
          class="setting-control setting-control-wide"
          :items="field.options || []"
          item-title="label"
          item-value="value"
          hide-details
          @update:model-value="set(field, $event)"
        />
      </div>
    </template>
  </component>
</template>

<style scoped>
.setting-list-item {
  margin-bottom: 16px;
  padding: 16px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-radius: 12px;
}
.setting-list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;
  overflow-wrap: anywhere;
}
.setting-field,
.setting-link-row {
  margin-bottom: 20px;
}

.setting-field-title {
  margin-bottom: 6px;
  color: var(--text-color);
  font-size: 15px;
  font-weight: 600;
}

.setting-field-description {
  margin-bottom: 10px;
  color: var(--text-color);
  font-size: 13px;
  opacity: 0.68;
}

.setting-control {
  max-width: 100%;
}

.setting-control-small {
  max-width: 220px;
}

.setting-control-medium {
  max-width: 420px;
}

.setting-control-wide {
  max-width: 320px;
}

.setting-file-input {
  display: flex;
  max-width: 520px;
  align-items: flex-start;
  gap: 8px;
}

.setting-file-input :deep(.v-input) {
  flex: 1;
}
</style>
