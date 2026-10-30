<script setup lang="ts">
import { ref } from "vue";
import { t } from "@/lang/i18n";
import { getValidatorErrorMsg } from "@/tools/validator";
import { message } from "@/tools/vuetifyToast";
import { VBtn, VCard, VCardActions, VCardText, VDialog, VSpacer, VTable } from "vuetify/components";
import {
  activeOperations,
  applyingChanges,
  applyMarketChanges,
  discardMarketChange,
  queuedChanges
} from "../operations";

const shown = ref(false);

async function apply() {
  const results = await applyMarketChanges();
  for (const result of results) {
    if (result.error) message.error(getValidatorErrorMsg(result.error));
    else if (result.failedNodes.length)
      message.error(
        t("TXT_CODE_PLUGIN_MARKET_NODE_FAILED", { nodes: result.failedNodes.join(", ") })
      );
    if (result.restartRequired) message.warning(t("TXT_CODE_PLUGIN_MARKET_RESTART_REQUIRED"));
  }
  if (results.length && !queuedChanges.value.length) {
    shown.value = false;
    message.success(t("TXT_CODE_PLUGIN_MARKET_CHANGES_APPLIED"));
  }
}
</script>

<template>
  <VBtn
    variant="tonal"
    color="primary"
    :disabled="!queuedChanges.length || Boolean(activeOperations)"
    :loading="applyingChanges"
    @click="shown = true"
  >
    {{ t("TXT_CODE_PLUGIN_MARKET_APPLY_CHANGES")
    }}<span v-if="queuedChanges.length"> ({{ queuedChanges.length }})</span>
  </VBtn>
  <VDialog v-model="shown" max-width="760" :persistent="applyingChanges">
    <VCard :title="t('TXT_CODE_PLUGIN_MARKET_APPLY_CHANGES')">
      <VCardText>
        <VTable>
          <thead>
            <tr>
              <th>{{ t("TXT_CODE_PLUGIN_MARKET_PLUGIN_ID") }}</th>
              <th>{{ t("TXT_CODE_PLUGIN_MARKET_CURRENT_VERSION") }}</th>
              <th>{{ t("TXT_CODE_PLUGIN_MARKET_TARGET_VERSION") }}</th>
              <th>{{ t("TXT_CODE_PLUGIN_MARKET_SELECT_NODES") }}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <tr v-for="change in queuedChanges" :key="change.plugin.id">
              <td>{{ change.plugin.displayName }}</td>
              <td>
                {{ change.plugin.installedVersion || t("TXT_CODE_PLUGIN_MARKET_NOT_INSTALLED") }}
              </td>
              <td>
                {{
                  change.kind === "uninstall"
                    ? t("TXT_CODE_PLUGIN_MARKET_UNINSTALL")
                    : change.version
                }}
                <div v-if="change.removeConfig" class="text-caption text-warning">
                  {{ t("TXT_CODE_PLUGIN_MARKET_REMOVE_CONFIG") }}
                </div>
              </td>
              <td>{{ change.daemonIds.join(", ") || "—" }}</td>
              <td>
                <VBtn
                  variant="text"
                  size="small"
                  :disabled="applyingChanges"
                  @click="discardMarketChange(change.plugin.id)"
                  >{{ t("TXT_CODE_PLUGIN_MARKET_DISCARD") }}</VBtn
                >
              </td>
            </tr>
          </tbody>
        </VTable>
      </VCardText>
      <VCardActions>
        <VBtn
          variant="text"
          :disabled="applyingChanges"
          @click="
            queuedChanges = [];
            shown = false;
          "
          >{{ t("TXT_CODE_PLUGIN_MARKET_DISCARD_ALL") }}</VBtn
        >
        <VSpacer />
        <VBtn :disabled="applyingChanges" @click="shown = false">{{
          t("TXT_CODE_PLUGIN_MARKET_CANCEL")
        }}</VBtn>
        <VBtn
          color="primary"
          :disabled="!queuedChanges.length || Boolean(activeOperations)"
          :loading="applyingChanges"
          @click="apply"
          >{{ t("TXT_CODE_PLUGIN_MARKET_CONFIRM") }}</VBtn
        >
      </VCardActions>
    </VCard>
  </VDialog>
</template>
