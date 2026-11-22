<script setup lang="ts">
import { computed } from "vue";
import TargetSelectionList from "@elementspanel/epanel-plugin-console/components/TargetSelectionList";
import { t } from "@elementspanel/epanel-plugin-i18n";
import { VBtn, VCard, VCardActions, VCardText, VDialog, VSpacer } from "vuetify/components";
import { marketTargetLabel, type MarketTargetOption } from "../targets";

const props = defineProps<{
  modelValue: boolean;
  selection: string[];
  targets: MarketTargetOption[];
  mode: "install" | "uninstall" | "update";
  name?: string;
}>();
const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  "update:selection": [value: string[]];
  confirm: [targets: string[]];
}>();
const selected = computed({
  get: () => props.selection,
  set: (value: string[]) => emit("update:selection", value)
});
const eligibleSelection = computed(() => {
  const ids = new Set(props.selection);
  return props.targets
    .filter((target) => !target.disabled && ids.has(target.daemonId))
    .map((target) => target.daemonId);
});
const targetItems = computed(() =>
  props.targets.map((target) => ({
    value: target.daemonId,
    title: target.daemonId ? target.remarks || target.ip : marketTargetLabel(target),
    subtitle: target.daemonId
      ? target.port
        ? `${target.ip}:${target.port}`
        : target.ip
      : undefined,
    hint: target.hint,
    disabled: target.disabled
  }))
);
function confirm() {
  if (eligibleSelection.value.length) emit("confirm", eligibleSelection.value);
}
</script>

<template>
  <VDialog
    :model-value="modelValue"
    max-width="640"
    scrollable
    @update:model-value="emit('update:modelValue', $event)"
  >
    <VCard :title="t('TXT_CODE_PLUGIN_MARKET_SELECT_TARGETS')">
      <VCardText>
        <div class="app-mb-6">
          {{
            t(
              mode === "uninstall"
                ? "TXT_CODE_PLUGIN_MARKET_TARGETS_UNINSTALL"
                : mode === "update"
                ? "TXT_CODE_PLUGIN_MARKET_TARGETS_UPDATE"
                : "TXT_CODE_PLUGIN_MARKET_TARGETS_INSTALL",
              { name: name ?? "" }
            )
          }}
        </div>
        <TargetSelectionList v-model="selected" :items="targetItems" />
        <slot />
      </VCardText>
      <VCardActions>
        <VSpacer />
        <VBtn variant="text" @click="emit('update:modelValue', false)">
          {{ t("TXT_CODE_PLUGIN_MARKET_CANCEL") }}
        </VBtn>
        <VBtn
          :color="mode === 'uninstall' ? 'error' : 'primary'"
          :disabled="!eligibleSelection.length"
          @click="confirm"
        >
          {{ t("TXT_CODE_PLUGIN_MARKET_CONFIRM") }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>
