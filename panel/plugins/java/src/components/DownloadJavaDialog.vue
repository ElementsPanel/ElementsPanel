<script setup lang="ts">
import AppDialog from "@/components/AppDialog.vue";
import { t } from "@/lang/i18n";
import { ref } from "vue";
import type { DownloadJavaConfigItem } from "../types";
import JavaVersionSelect from "./JavaVersionSelect.vue";

const props = defineProps<{
  daemonId: string;
  installedJavaList?: string[];
  destroyComponent(delay?: number): void;
  emitResult(data?: DownloadJavaConfigItem): void;
}>();
const open = ref(true);
const version = ref("");
const cancel = () => {
  open.value = false;
  props.destroyComponent?.();
};
const submit = () => {
  if (!version.value) return;
  props.emitResult({ name: "msl", version: version.value });
  cancel();
};
</script>

<template>
  <AppDialog
    v-model:open="open"
    :title="t('TXT_CODE_84588601')"
    :max-width="620"
    :closable="false"
    :ok-button-props="{ disabled: !version }"
    @ok="submit"
    @cancel="cancel"
  >
    <JavaVersionSelect
      v-model="version"
      :daemon-id="daemonId"
      :installed-java-list="installedJavaList"
    />
  </AppDialog>
</template>
