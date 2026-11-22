<script setup lang="ts">
import Empty from "@elementspanel/epanel-plugin-console/components/Empty";
/* eslint-disable vue/no-mutating-props */
import type { FrontendFileManagerService } from "@elements-panel/sdk";
import { usePluginService } from "@elements-panel/sdk";
import { router } from "@elementspanel/epanel-plugin-console/config/router";
import { t } from "@elementspanel/epanel-plugin-i18n";
import { computed, reactive, ref, watch } from "vue";
import {
  VBtn,
  VCard,
  VCardActions,
  VCardText,
  VColorPicker,
  VDialog,
  VForm,
  VMenu,
  VSelect,
  VSlider,
  VSwitch,
  VTextField,
  VTextarea
} from "vuetify/components";
import type { SettingField } from "../api";

const props = defineProps<{
  fields: SettingField[];
  values: Record<string, unknown>;
  savedValues?: Record<string, unknown>;
  nested?: boolean;
}>();

// eslint-disable-next-line no-unused-vars
const emit = defineEmits<{ (event: "save"): void }>();

const visible = (field: SettingField, values = props.values) => {
  const conditions = field.visibleWhen;
  if (!conditions) return true;
  const list = Array.isArray(conditions) ? conditions : [conditions];
  return list.every((condition) => {
    const [key, expected] = condition.split("=");
    const value = values[key];
    return expected === undefined ? Boolean(value) : String(value ?? "") === expected;
  });
};

const fieldModified = (field: SettingField) =>
  Boolean(
    props.savedValues && field.key && field.type !== "link" &&
    JSON.stringify(props.values[field.key]) !== JSON.stringify(props.savedValues[field.key])
  );

const savedItem = (field: SettingField, index: number): Record<string, unknown> | undefined => {
  if (!props.savedValues || !field.key) return undefined;
  const entries = props.savedValues[field.key];
  return Array.isArray(entries) ? entries[index] ?? {} : {};
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
const emptyItem = (field: SettingField) =>
  Object.fromEntries(
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
          : child.type === "select"
          ? child.options?.[0]?.value ?? ""
          : ""
      ])
  );

const editor = ref<{
  field: SettingField;
  original?: Record<string, unknown>;
  draft: Record<string, unknown>;
}>();
const editorOpen = ref(false);
const editorSavedValues = computed(() => {
  const current = editor.value;
  if (!current || !props.savedValues) return undefined;
  return current.original
    ? savedItem(current.field, items(current.field).indexOf(current.original))
    : {};
});
// Clone the full JSON item to preserve IDs and secret flags without applying cancelled edits.
const copyItem = (item: Record<string, unknown>) =>
  JSON.parse(JSON.stringify(item)) as Record<string, unknown>;
const editItem = (field: SettingField, item?: Record<string, unknown>) => {
  if (!item && items(field).length >= (field.maxItems ?? 100)) return;
  editor.value = { field, original: item, draft: item ? copyItem(item) : emptyItem(field) };
  editorOpen.value = true;
};
const cancelEditor = () => {
  editorOpen.value = false;
};
const clearEditor = () => {
  if (!editorOpen.value) editor.value = undefined;
};
const canConfirm = computed(() => {
  const current = editor.value;
  if (!current || !editorOpen.value) return false;
  if (!current.original && items(current.field).length >= (current.field.maxItems ?? 100))
    return false;
  return (current.field.fields || []).every((field) => {
    if (!field.required || !field.key || !visible(field, current.draft)) return true;
    const value = current.draft[field.key];
    return value !== undefined && value !== null && (typeof value !== "string" || !!value.trim());
  });
});
const confirmEditor = () => {
  const current = editor.value;
  if (!current || !canConfirm.value) return;
  const entries = [...items(current.field)];
  if (current.original) {
    const index = entries.indexOf(current.original);
    // A replaced/removed item must never cause another row to be overwritten.
    if (index === -1) {
      cancelEditor();
      return;
    }
    entries[index] = copyItem(current.draft);
  } else {
    entries.push(copyItem(current.draft));
  }
  set(current.field, entries);
  cancelEditor();
};
watch(
  () => [props.values, props.fields],
  () => {
    cancelEditor();
    clearEditor();
  }
);

const addItem = (field: SettingField) => {
  if (items(field).length >= (field.maxItems ?? 100)) return;
  if (field.listEditor === "dialog") editItem(field);
  else set(field, [...items(field), emptyItem(field)]);
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
        <VBtn variant="tonal" type="button" @click="open(field)">{{ field.title }}</VBtn>
      </div>

      <div
        v-else-if="visible(field)"
        class="setting-field"
        :class="{ 'setting-field--modified': fieldModified(field) }"
      >
        <span class="setting-field-marker" aria-hidden="true" />
        <div class="setting-field-title">{{ field.title }}</div>
        <div v-if="field.description" class="setting-field-description">
          {{ field.description }}
        </div>

        <div v-if="field.type === 'list'" class="setting-list">
          <section
            v-for="(item, itemIndex) in items(field)"
            :key="itemIndex"
            class="setting-list-item"
            :class="{ 'setting-list-item--compact': field.listEditor === 'dialog' }"
          >
            <div class="setting-list-header">
              <strong
                class="setting-list-name"
                :title="String(item[field.itemTitleKey || 'name'] || '')"
                >{{
                  String(item[field.itemTitleKey || "name"] || `${field.title} ${itemIndex + 1}`)
                }}</strong
              >
              <div class="setting-list-actions">
                <VBtn
                  v-if="field.listEditor === 'dialog'"
                  type="button"
                  icon="mdi-pencil-outline"
                  variant="text"
                  size="small"
                  :title="field.editLabel || t('TXT_CODE_COMMON_EDIT')"
                  :aria-label="field.editLabel || t('TXT_CODE_COMMON_EDIT')"
                  @click="editItem(field, item)"
                />
                <VBtn
                  type="button"
                  icon="mdi-delete-outline"
                  variant="text"
                  size="small"
                  :title="field.removeLabel || t('TXT_CODE_COMMON_REMOVE')"
                  :aria-label="field.removeLabel || t('TXT_CODE_COMMON_REMOVE')"
                  @click="removeItem(field, itemIndex)"
                />
              </div>
            </div>
            <SchemaForm
              v-if="field.listEditor !== 'dialog'"
              :fields="field.fields || []"
              :values="item"
              :saved-values="savedItem(field, itemIndex)"
              nested
            />
          </section>
          <VBtn
            type="button"
            prepend-icon="mdi-plus"
            variant="tonal"
            class="mt-3"
            :disabled="items(field).length >= (field.maxItems ?? 100)"
            @click="addItem(field)"
          >
            {{ field.addLabel || t("TXT_CODE_COMMON_ADD") }}
          </VBtn>
        </div>
        <VTextarea
          v-else-if="field.type === 'text'"
          :model-value="String(values[field.key!] ?? '')"
          :rows="4"
          :placeholder="field.placeholder || t('TXT_CODE_COMMON_PLEASE_ENTER_CONTENT')"
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
            :placeholder="field.placeholder || t('TXT_CODE_COMMON_PLEASE_ENTER_CONTENT')"
            density="comfortable"
            hide-details
            clearable
            @update:model-value="set(field, $event)"
          />
          <VBtn
            v-if="fileManager"
            type="button"
            variant="tonal"
            height="auto"
            :loading="field.key ? uploading.has(field.key) : false"
            @click="upload(field)"
          >
            {{ t("TXT_CODE_COMMON_UPLOAD") }}
          </VBtn>
        </div>
        <VMenu
          v-else-if="field.type === 'color'"
          location="bottom start"
          :offset="8"
          :close-on-content-click="false"
          max-width="calc(100vw - 32px)"
        >
          <template #activator="{ props: menuProps }">
            <VBtn
              v-bind="menuProps"
              type="button"
              class="setting-color-preview"
              :color="String(values[field.key!] || 'transparent')"
              :aria-label="field.title"
              :title="String(values[field.key!] ?? '')"
              variant="flat"
            >
              {{ String(values[field.key!] ?? '').toUpperCase() }}
            </VBtn>
          </template>
          <VColorPicker
            :model-value="String(values[field.key!] ?? '')"
            :aria-label="field.title"
            mode="hex"
            :modes="['hex']"
            max-width="100%"
            elevation="0"
            @update:model-value="set(field, $event)"
          />
        </VMenu>
        <VTextField
          v-else-if="field.type === 'string' && !field.secret"
          :model-value="String(values[field.key!] ?? '')"
          class="setting-control setting-control-medium"
          :placeholder="field.placeholder || t('TXT_CODE_COMMON_PLEASE_ENTER_CONTENT')"
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
          :placeholder="field.placeholder || t('TXT_CODE_COMMON_PLEASE_ENTER_CONTENT')"
          density="comfortable"
          hide-details
          @update:model-value="set(field, $event)"
        />
        <VSlider
          v-else-if="field.type === 'number' && field.control === 'slider'"
          :model-value="Number(values[field.key!] ?? field.min ?? 0)"
          class="setting-control setting-control-medium"
          color="primary"
          :aria-label="field.title"
          :min="field.min ?? 0"
          :max="field.max ?? 100"
          :step="1"
          thumb-label
          hide-details
          @update:model-value="setNumber(field, $event)"
        >
          <template #append>
            <span class="setting-slider-value">
              {{ Number(values[field.key!] ?? field.min ?? 0) }} {{ field.unit }}
            </span>
          </template>
        </VSlider>
        <VTextField
          v-else-if="field.type === 'number'"
          :model-value="Number(values[field.key!] ?? 0)"
          class="setting-control setting-control-small"
          type="number"
          :min="field.min"
          :max="field.max"
          :suffix="field.unit"
          density="comfortable"
          hide-details
          @update:model-value="setNumber(field, $event)"
        />
        <VSwitch
          v-else-if="field.type === 'boolean'"
          :model-value="Boolean(values[field.key!])"
          :aria-label="field.title"
          density="compact"
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
        >
          <template #no-data><Empty :icon="false" compact /></template>
        </VSelect>
      </div>
    </template>
  </component>
  <VDialog v-if="editor" v-model="editorOpen" max-width="640" scrollable @after-leave="clearEditor">
    <VCard
      :title="t(editor.original ? 'TXT_CODE_COMMON_EDIT' : 'TXT_CODE_COMMON_ADD')"
      class="setting-list-editor"
    >
      <VForm @submit.stop.prevent="confirmEditor">
        <VCardText class="setting-list-editor-content">
          <SchemaForm
            :fields="editor.field.fields || []"
            :values="editor.draft"
            :saved-values="editorSavedValues"
            nested
          />
        </VCardText>
        <VCardActions class="justify-end">
          <VBtn type="button" @click="cancelEditor">{{ t("TXT_CODE_COMMON_CANCEL") }}</VBtn>
          <VBtn type="submit" color="primary" variant="flat" :disabled="!canConfirm">{{
            t("TXT_CODE_COMMON_CONFIRM")
          }}</VBtn>
        </VCardActions>
      </VForm>
    </VCard>
  </VDialog>
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
.setting-list-item--compact {
  padding: 8px 0;
  margin-bottom: 0;
  border: 0;
  border-radius: 0;
}
.setting-list-item--compact .setting-list-header {
  margin-bottom: 0;
}
.setting-list-name {
  flex: 1;
  min-width: 0;
}
.setting-list-item--compact .setting-list-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.setting-list-actions {
  display: flex;
  flex-shrink: 0;
  gap: 4px;
}
.setting-list-editor :deep(.setting-control) {
  width: 100%;
}
.setting-list-editor > :deep(.v-form) {
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.setting-list-editor-content {
  /* VForm separates this body from the card, bypassing VDialog's padding rules. */
  padding: 16px 24px 24px 30px;
  overflow-y: auto;
}
.setting-field,
.setting-link-row {
  margin-bottom: 20px;
  padding-left: 16px;
}

.setting-field {
  position: relative;
}

.setting-field-marker {
  position: absolute;
  top: 8px;
  bottom: 8px;
  left: 0;
  width: 6px;
  border-radius: 3px;
  pointer-events: none;
  transition: background-color 0.15s;
}

.setting-field--modified > .setting-field-marker {
  background-color: #ff9800;
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

.setting-slider-value {
  min-width: 4em;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.setting-color-preview {
  width: 160px;
  max-width: 100%;
  height: 52px;
  border: 4px solid rgb(var(--app-field-surface, var(--v-theme-field-surface))) !important;
}

.setting-file-input {
  display: flex;
  max-width: 520px;
  align-items: stretch;
  gap: 8px;
}

.setting-file-input :deep(.v-input) {
  flex: 1;
}

@media (max-width: 992px) {
  .setting-field,
  .setting-link-row,
  .setting-list,
  .setting-file-input {
    min-width: 0;
  }

  .setting-field-title,
  .setting-field-description {
    overflow-wrap: anywhere;
  }

  .setting-control,
  .setting-file-input {
    width: 100%;
    max-width: 100%;
  }

  .setting-control :deep(.v-input__control),
  .setting-control :deep(.v-field),
  .setting-control :deep(.v-field__input) {
    min-width: 0;
  }

  .setting-control :deep(.v-select__selection-text) {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .setting-file-input {
    flex-direction: column;
    align-items: stretch;
  }

  .setting-file-input :deep(.v-input) {
    width: 100%;
    min-width: 0;
  }

  .setting-link-row :deep(.v-btn),
  .setting-list > :deep(.v-btn),
  .setting-file-input :deep(.v-btn) {
    width: 100%;
    min-height: 44px;
    height: auto;
    padding: 12px 16px;
  }

  .setting-link-row :deep(.v-btn__content),
  .setting-list > :deep(.v-btn .v-btn__content),
  .setting-file-input :deep(.v-btn__content) {
    white-space: normal;
    overflow-wrap: anywhere;
  }

  .setting-list-item:not(.setting-list-item--compact) {
    padding: 12px;
  }

  .setting-list-actions :deep(.v-btn) {
    width: 44px;
    height: 44px;
  }

  .setting-list-editor-content {
    padding: 16px;
  }

  .setting-list-editor :deep(.v-card-title) {
    white-space: normal;
    overflow-wrap: anywhere;
  }

  .setting-list-editor :deep(.v-card-actions) {
    flex-wrap: wrap;
  }
}
</style>
