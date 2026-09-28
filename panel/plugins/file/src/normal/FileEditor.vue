<script setup lang="ts">
import Editor from "@/components/Editor.vue";
import { useScreen } from "@/hooks/useScreen";
import { t } from "@/lang/i18n";
import { fileContent } from "../api";
import { reportErrorMsg } from "@/tools/validator";
import { message } from "@/tools/vuetifyToast";
import { onUnmounted, ref } from "vue";
import {
  VBtn,
  VCard,
  VCardActions,
  VCardText,
  VDialog,
  VIcon,
  VProgressCircular,
  VSpacer
} from "vuetify/components";

const emit = defineEmits(["save"]);

const open = ref(false);
const openEditor = ref(false);
const editorText = ref("");
const fileName = ref("");
const path = ref("");
const fullScreen = ref(false);
const editorKey = ref(0);
const isLoading = ref(false);
const isSaving = ref(false);

const { isPhone } = useScreen();

let resolveDialog: ((text?: string) => void) | undefined;
let controller: AbortController | undefined;
let session = 0;
let disposed = false;

const props = defineProps<{
  daemonId: string;
  instanceId: string;
}>();

const handleKeydown = (event: KeyboardEvent) => {
  if (
    !open.value ||
    !(event.ctrlKey || event.metaKey) ||
    event.altKey ||
    event.key.toLowerCase() !== "s"
  ) return;
  event.preventDefault();
  void save(false);
};

const closeDialog = (text?: string) => {
  session++;
  controller?.abort();
  controller = undefined;
  document.removeEventListener("keydown", handleKeydown);
  open.value = false;
  openEditor.value = false;
  isLoading.value = false;
  isSaving.value = false;
  const resolve = resolveDialog;
  resolveDialog = undefined;
  resolve?.(text);
};

const render = async (request: number, signal: AbortSignal) => {
  try {
    const response = await fileContent().execute({
      signal,
      params: {
        daemonId: props.daemonId,
        uuid: props.instanceId
      },
      data: {
        target: path.value
      }
    });

    if (request !== session || signal.aborted) return;
    editorText.value = typeof response.value === "string" ? response.value : "";
    openEditor.value = true;
  } catch (error) {
    if (request !== session || signal.aborted) return;
    reportErrorMsg(error);
    closeDialog();
  } finally {
    if (request === session) isLoading.value = false;
  }
};

const openDialog = (target: string, name: string): Promise<string | undefined> => {
  if (disposed) return Promise.resolve(undefined);
  closeDialog();
  path.value = target;
  fileName.value = name;
  editorText.value = "";
  editorKey.value++;
  fullScreen.value = isPhone.value;
  open.value = true;
  isLoading.value = true;
  controller = new AbortController();
  document.addEventListener("keydown", handleKeydown);
  return new Promise((resolve) => {
    resolveDialog = resolve;
    void render(session, controller!.signal);
  });
};

const save = async (closeAfterSave: boolean) => {
  if (!open.value || !openEditor.value || isLoading.value || isSaving.value || !controller) return;
  const request = session;
  const signal = controller.signal;
  const text = editorText.value;
  isSaving.value = true;
  try {
    await fileContent().execute({
      signal,
      params: { daemonId: props.daemonId, uuid: props.instanceId },
      data: { target: path.value, text }
    });
    if (request !== session || signal.aborted) return;
    message.success(t(closeAfterSave ? "TXT_CODE_a7907771" : "TXT_CODE_8f47d95"));
    emit("save");
    if (closeAfterSave) closeDialog(text);
  } catch (error) {
    if (request === session && !signal.aborted) reportErrorMsg(error);
  } finally {
    if (request === session) isSaving.value = false;
  }
};

const submit = () => save(true);
const cancel = () => closeDialog();

onUnmounted(() => {
  disposed = true;
  closeDialog();
});

defineExpose({
  openDialog
});
</script>

<template>
  <VDialog v-model="open" class="file-editor-dialog app-dialog" :class="{ 'file-editor-dialog--full': fullScreen }"
    :width="fullScreen ? undefined : '1600px'"
    :max-width="fullScreen ? undefined : 'calc(100vw - 48px)'" :fullscreen="fullScreen" persistent scrollable>
    <VCard :title="t('TXT_CODE_1f61e5a3')" :subtitle="fileName" rounded="xl" class="file-editor-card">
      <template v-if="!isPhone" #append>
        <VBtn icon size="small" variant="text" :aria-label="fileName" @click="fullScreen = !fullScreen">
          <VIcon :icon="fullScreen ? 'mdi-fullscreen-exit' : 'mdi-fullscreen'" />
        </VBtn>
      </template>
      <VCardText class="file-editor-content">
        <Editor v-if="openEditor" :key="editorKey" v-model:text="editorText" :filename="fileName"
          :height="fullScreen ? '100%' : '60vh'" />
        <div v-else class="file-editor-loading"><VProgressCircular indeterminate color="primary" /></div>
      </VCardText>
      <VCardActions>
        <VSpacer />
        <VBtn variant="text" :disabled="isSaving" @click="cancel">{{ t("TXT_CODE_3b1cc020") }}</VBtn>
        <VBtn color="primary" :disabled="!openEditor || isLoading" :loading="isSaving" @click="submit">
          {{ t("TXT_CODE_abfe9512") }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<style lang="scss">
.file-editor-card {
  display: flex;
  flex-direction: column;
  width: 100%;
  min-height: 0;
}

.file-editor-content {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.file-editor-loading {
  display: grid;
  min-height: 60vh;
  place-items: center;
}

.file-editor-dialog--full .file-editor-card {
  height: 100svh;
  border-radius: 0 !important;
}
</style>
