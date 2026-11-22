<script setup lang="ts">
import { t } from "@elementspanel/epanel-plugin-i18n";
import { computed, unref, type Ref } from "vue";
import { VCheckbox } from "vuetify/components";

const props = defineProps<{
  count?: number;
  fileName: string;
  all?: boolean | Ref<boolean>;
  overwrite: boolean | Ref<boolean>;
}>();

const emit = defineEmits<{
  (e: "update:all", value: boolean): void;
  (e: "update:overwrite", value: boolean): void;
}>();

const overwriteRef = computed({
  get: () => unref(props.overwrite),
  set: (value: boolean) => emit("update:overwrite", value)
});
const allRef = computed({
  get: () => unref(props.all) ?? false,
  set: (value: boolean) => emit("update:all", value)
});
</script>

<template>
  <div class="flex-column">
    {{ t("TXT_CODE_COMMON_THE_FILE_ALREADY_EXISTS_IN_THIS_FOLDER", { name: props.fileName }) }}
    <div style="margin-top: 16px; margin-bottom: -8px">
      <VCheckbox v-model="overwriteRef" :label="t('TXT_CODE_COMMON_OVERWRITE')" density="compact" hide-details />
      <VCheckbox
        v-if="props.count && props.count > 1"
        v-model="allRef"
        :label="t('TXT_CODE_COMMON_AND_MORE', { num: props.count - 1 })"
        density="compact"
        hide-details
      />
    </div>
  </div>
</template>
