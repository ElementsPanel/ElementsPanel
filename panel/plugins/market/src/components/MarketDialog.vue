<script setup lang="ts">
import { useDialog } from "@/hooks/useDialog";
import { t } from "@/lang/i18n";
import { reportErrorMsg } from "@/tools/validator";
import type { QuickStartPackages } from "@/types";
import { ref } from "vue";
import AppDialog from "@/components/AppDialog.vue";
import { VBtn } from "vuetify/lib/components/index.mjs";
import { reinstallInstance } from "../api";
import type { OpenMarketDialogProps } from "../market-dialog";
import AppPackages from "../normal/AppPackages.vue";

// The two callbacks `useMountComponent` injects, spelled out rather than taken
// from the core `MountComponent<T>`: the SFC compiler resolves `defineProps`
// types itself, and it cannot follow the `@/` alias from a plugin directory.
interface Props extends OpenMarketDialogProps {
  destroyComponent?: (delay?: number) => void;
  emitResult?: (data?: QuickStartPackages) => void;
}

const props = defineProps<Props>();

const { isVisible, openDialog: open, cancel, submit } = useDialog<QuickStartPackages>(props);

const openDialog = async () => {
  appPackages.value?.fetchTemplate();
  return await open();
};

const appPackages = ref<InstanceType<typeof AppPackages>>();
const reinstallConfirmOpen = ref(false);
const pendingTemplate = ref<QuickStartPackages | null>(null);

const handleSelectCategory = (item: QuickStartPackages) => {
  appPackages.value?.handleSelectTopCategory(item);
};

const handleSelectTemplate = async (
  item: QuickStartPackages | null,
  _type: "normal" | "docker"
) => {
  if (!item) {
    return submit(undefined);
  }
  if (!props.autoInstall || !props.instanceId || !props.daemonId) {
    await submit(item);
    return;
  } else {
    pendingTemplate.value = item;
    reinstallConfirmOpen.value = true;
  }
};

const confirmReinstall = async () => {
  const item = pendingTemplate.value;
  if (!item) return;
  try {
    await reinstallInstance().execute({
      params: { daemonId: props.daemonId || "", uuid: props.instanceId || "" },
      data: { targetUrl: item.targetLink, title: item.title, description: item.description }
    });
    reinstallConfirmOpen.value = false;
    await submit(item);
  } catch (err: any) {
    console.error(err);
    reportErrorMsg(err.message);
  }
};

const closeReinstall = () => {
  reinstallConfirmOpen.value = false;
  pendingTemplate.value = null;
};

defineExpose({
  openDialog
});
</script>

<template>
  <AppDialog
    v-model:open="isVisible"
    max-width="1600px"
    :cancel-text="t('TXT_CODE_3b1cc020')"
    :mask-closable="false"
    :confirm-loading="false"
    @cancel="cancel"
  >
    <AppPackages
      ref="appPackages"
      :btn-text="btnText"
      :title="dialogTitle"
      :show-custom-btn="showCustomBtn"
      :only-docker-template="onlyDockerTemplate"
      @handle-select-category="handleSelectCategory"
      @handle-select-template="handleSelectTemplate"
      @handle-back-to-category="() => {}"
    />
    <template #footer>
      <VBtn variant="text" @click="cancel">{{ t("TXT_CODE_a7e9d4e") }}</VBtn>
    </template>
  </AppDialog>
  <AppDialog
    v-model:open="reinstallConfirmOpen"
    :title="t('TXT_CODE_617ce69c')"
    compact
    @cancel="closeReinstall"
  >
    <div>{{ t("TXT_CODE_94f1ba3") }}</div>
    <template #footer>
      <VBtn variant="text" @click="closeReinstall">{{ t("TXT_CODE_a7e9d4e") }}</VBtn>
      <VBtn color="primary" @click="confirmReinstall">{{ t("TXT_CODE_ed3fc23") }}</VBtn>
    </template>
  </AppDialog>
</template>
