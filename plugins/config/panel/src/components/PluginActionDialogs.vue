<script setup lang="ts">
import TargetSelectionList from "@elementspanel/epanel-plugin-console/components/TargetSelectionList";
import { t } from "@elementspanel/epanel-plugin-i18n";
import { computed, toRef } from "vue";
import {
  VAlert,
  VBtn,
  VCard,
  VCardActions,
  VCardText,
  VCheckbox,
  VDialog,
  VSpacer
} from "vuetify/components";
import { pluginLabel } from "../labels";
import type { PluginActionCandidate } from "../types";

const props = defineProps<{
  candidate: PluginActionCandidate | null;
  submitting: boolean;
  confirmOpen: boolean;
  pickerOpen: boolean;
  items: Array<{
    value: string;
    title: string;
    subtitle?: string;
    disabled: boolean;
    hint?: string;
  }>;
}>();
const emit = defineEmits<{
  "update:confirmOpen": [value: boolean];
  "update:pickerOpen": [value: boolean];
  confirm: [];
}>();
const actionCandidate = toRef(props, "candidate");
const actionSubmitting = toRef(props, "submitting");
const nodeTargetItems = toRef(props, "items");
const actionConfirmOpen = computed({
  get: () => props.confirmOpen,
  set: (value: boolean) => emit("update:confirmOpen", value)
});
const nodePickerOpen = computed({
  get: () => props.pickerOpen,
  set: (value: boolean) => emit("update:pickerOpen", value)
});
</script>

<template>
  <VDialog v-model="actionConfirmOpen" :persistent="actionSubmitting" max-width="460">
    <VCard
      :title="
        t(
          actionCandidate?.action === 'remove'
            ? 'TXT_CODE_PLUGIN_DELETE_CONFIRM_TITLE'
            : 'TXT_CODE_PLUGIN_DISABLE_CONFIRM_TITLE',
          { name: pluginLabel(actionCandidate?.plugin.id) }
        )
      "
      class="plugin-config-confirm-card"
      rounded="xl"
    >
      <VCardText>
        {{
          t(
            actionCandidate?.action === "remove"
              ? "TXT_CODE_PLUGIN_DELETE_CONFIRM"
              : "TXT_CODE_PLUGIN_DISABLE_CONFIRM"
          )
        }}
        <VCheckbox
          v-if="actionCandidate?.action === 'remove'"
          v-model="actionCandidate.removeConfig"
          :label="t('TXT_CODE_PLUGIN_REMOVE_CONFIG')"
          :disabled="actionSubmitting || actionCandidate.checkingNodes"
          density="compact"
          hide-details
          class="mt-3"
        />
      </VCardText>
      <VCardActions>
        <VSpacer />
        <VBtn variant="text" :disabled="actionSubmitting" @click="actionConfirmOpen = false">
          {{ t("TXT_CODE_PLUGIN_CANCEL") }}
        </VBtn>
        <VBtn
          color="error"
          :prepend-icon="actionCandidate?.action === 'remove' ? 'mdi-delete' : undefined"
          :loading="actionSubmitting || actionCandidate?.checkingNodes"
          :disabled="actionCandidate?.checkingNodes"
          @click="emit('confirm')"
        >
          {{
            t(
              actionCandidate?.action === "remove"
                ? "TXT_CODE_PLUGIN_DELETE"
                : "TXT_CODE_PLUGIN_DISABLE"
            )
          }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>

  <VDialog v-model="nodePickerOpen" :persistent="actionSubmitting" max-width="640" scrollable>
    <VCard :title="t('TXT_CODE_PLUGIN_NODE_SELECT')">
      <VCardText v-if="actionCandidate">
        <div v-if="actionCandidate.nodeTargets.length" class="mb-6">
          {{
            t(
              actionCandidate.action === "remove"
                ? "TXT_CODE_PLUGIN_NODE_DELETE_CONFIRM"
                : actionCandidate.action === "enable"
                ? "TXT_CODE_PLUGIN_NODE_ENABLE_CONFIRM"
                : "TXT_CODE_PLUGIN_NODE_DISABLE_CONFIRM"
            )
          }}
        </div>
        <VAlert
          v-if="actionCandidate.nodeCheckError"
          class="mb-6"
          type="warning"
          variant="tonal"
          :text="actionCandidate.nodeCheckError"
        />
        <TargetSelectionList
          v-model="actionCandidate.selectedNodeIds"
          :items="nodeTargetItems"
          :disabled="actionSubmitting"
        />
      </VCardText>
      <VCardActions>
        <VSpacer />
        <VBtn variant="text" :disabled="actionSubmitting" @click="nodePickerOpen = false">
          {{ t("TXT_CODE_PLUGIN_CANCEL") }}
        </VBtn>
        <VBtn color="primary" :loading="actionSubmitting" @click="emit('confirm')">
          {{ t("TXT_CODE_COMMON_CONFIRM") }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<style lang="scss" scoped>
@media (max-width: 992px) {
  .plugin-config-confirm-card :deep(.v-card-title) {
    white-space: normal;
    overflow-wrap: anywhere;
  }

  .plugin-config-confirm-card :deep(.v-card-actions) {
    flex-wrap: wrap;
  }
}
</style>
