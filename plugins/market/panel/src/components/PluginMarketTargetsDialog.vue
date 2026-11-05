<script setup lang="ts">
import { computed } from "vue";
import { t } from "@elementspanel/epanel-plugin-i18n";
import {
  VBtn,
  VCard,
  VCardActions,
  VCardText,
  VCheckbox,
  VDialog,
  VSpacer
} from "vuetify/components";
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
const eligibleSelection = computed(() =>
  props.targets
    .filter((target) => !target.disabled && props.selection.includes(target.daemonId))
    .map((target) => target.daemonId)
);
function confirm() {
  if (eligibleSelection.value.length) emit("confirm", eligibleSelection.value);
}
</script>

<template>
  <VDialog
    :model-value="modelValue"
    max-width="480"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <VCard :title="t('TXT_CODE_PLUGIN_MARKET_SELECT_TARGETS')">
      <VCardText>
        <div class="mb-2">
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
        <div class="plugin-market-targets">
          <VCheckbox
            v-for="target in targets"
            :key="target.daemonId"
            v-model="selected"
            :value="target.daemonId"
            :label="marketTargetLabel(target)"
            :disabled="target.disabled"
            density="compact"
            hide-details
          >
            <template #label>
              <div class="py-1">
                <div>{{ marketTargetLabel(target) }}</div>
                <div v-if="target.hint" class="text-caption text-medium-emphasis">
                  {{ target.hint }}
                </div>
              </div>
            </template>
          </VCheckbox>
        </div>
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

<style scoped>
.plugin-market-targets {
  max-height: 45vh;
  overflow-y: auto;
}
</style>
