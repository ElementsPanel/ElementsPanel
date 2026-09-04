<script setup lang="ts">
import { t } from "@/lang/i18n";
import type { FrontendFileManagerService } from "@/plugin";
import { usePluginService } from "@/plugin/context";
import { router } from "@/config/router";
import { computed, reactive } from "vue";
import type { SettingField } from "./api";

// The one form that renders every plugin's configuration. It knows nothing about
// any particular plugin: the fields arrive from the backend that declared them,
// with their labels already translated, which is what lets the same component
// render a daemon plugin's settings — the browser holds no copy of a daemon
// plugin at all.

const props = defineProps<{
  fields: SettingField[];
  values: Record<string, unknown>;
  saving?: boolean;
}>();

const emit = defineEmits<{ (event: "save"): void }>();

const allYesNo = [
  { label: t("TXT_CODE_52c8a730"), value: true },
  { label: t("TXT_CODE_718c9310"), value: false }
];

/**
 * A field is hidden unless every condition holds. A condition is either a field
 * name — true when that field is truthy — or `"name=value"`.
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

const editable = computed(() => props.fields.filter((field) => field.type !== "link"));
const fileManager = computed(() => usePluginService<FrontendFileManagerService>("file"));

const uploading = reactive(new Set<string>());

const set = (field: SettingField, value: unknown) => {
  if (field.key) props.values[field.key] = value;
};

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
  <a-form layout="vertical">
    <template v-for="(field, index) in fields" :key="field.key || `link-${index}`">
      <a-form-item v-if="field.type === 'link'">
        <a-button @click="open(field)">{{ field.title }}</a-button>
      </a-form-item>

      <a-form-item v-else-if="visible(field)">
        <a-typography-title :level="5">{{ field.title }}</a-typography-title>
        <a-typography-paragraph v-if="field.description" type="secondary">
          {{ field.description }}
        </a-typography-paragraph>

        <a-textarea
          v-if="field.type === 'text'"
          :value="String(values[field.key!] ?? '')"
          :rows="4"
          :placeholder="field.placeholder || t('TXT_CODE_4ea93630')"
          @update:value="set(field, $event)"
        />
        <div v-else-if="field.type === 'string' && !field.secret && field.fileUpload" class="setting-file-input">
          <a-input
            :value="String(values[field.key!] ?? '')"
            allow-clear
            :placeholder="field.placeholder || t('TXT_CODE_4ea93630')"
            @update:value="set(field, $event)"
          />
          <a-button v-if="fileManager" :loading="field.key ? uploading.has(field.key) : false" @click="upload(field)">
            {{ t("TXT_CODE_ae09d79d") }}
          </a-button>
        </div>
        <a-input
          v-else-if="field.type === 'string' && !field.secret"
          :value="String(values[field.key!] ?? '')"
          style="max-width: 420px"
          :placeholder="field.placeholder || t('TXT_CODE_4ea93630')"
          @update:value="set(field, $event)"
        />
        <a-input-password
          v-else-if="field.type === 'string'"
          :value="String(values[field.key!] ?? '')"
          style="max-width: 420px"
          :placeholder="field.placeholder || t('TXT_CODE_4ea93630')"
          @update:value="set(field, $event)"
        />
        <a-input-number
          v-else-if="field.type === 'number'"
          :value="Number(values[field.key!] ?? 0)"
          :min="field.min"
          :max="field.max"
          style="max-width: 220px"
          @update:value="set(field, $event)"
        />
        <a-select
          v-else-if="field.type === 'boolean'"
          :value="Boolean(values[field.key!]) as any"
          style="max-width: 220px"
          @update:value="set(field, $event)"
        >
          <a-select-option v-for="item in allYesNo" :key="String(item.value)" :value="item.value">
            {{ item.label }}
          </a-select-option>
        </a-select>
        <a-select
          v-else-if="field.type === 'select'"
          :value="values[field.key!] as any"
          style="max-width: 320px"
          @update:value="set(field, $event)"
        >
          <a-select-option
            v-for="item in field.options || []"
            :key="String(item.value)"
            :value="item.value"
          >
            {{ item.label }}
          </a-select-option>
        </a-select>
      </a-form-item>
    </template>

    <a-form-item v-if="editable.length">
      <a-button type="primary" :loading="saving" @click="emit('save')">
        {{ t("TXT_CODE_d507abff") }}
      </a-button>
    </a-form-item>
  </a-form>
</template>

<style scoped>
.setting-file-input {
  display: flex;
  max-width: 520px;
  gap: 8px;
}

.setting-file-input :deep(.ant-input) {
  flex: 1;
}
</style>
