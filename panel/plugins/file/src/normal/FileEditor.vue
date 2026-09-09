<script setup lang="ts">
import Editor from "@/components/Editor.vue";
import { useKeyboardEvents } from "@/hooks/useKeyboardEvents";
import { useScreen } from "@/hooks/useScreen";
import { t } from "@/lang/i18n";
import { fileContent } from "../api";
import { reportErrorMsg } from "@/tools/validator";
import { message } from "ant-design-vue";
import { computed, ref } from "vue";
import {
  VBtn,
  VCard,
  VCardActions,
  VCardText,
  VCardTitle,
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

const { isPhone } = useScreen();

// eslint-disable-next-line no-unused-vars
let resolve: (t: string) => void;
// eslint-disable-next-line no-unused-vars
let reject: (e: Error) => void;

const props = defineProps<{
  daemonId: string;
  instanceId: string;
}>();

let useKeyboardEventsHooks: ReturnType<typeof useKeyboardEvents> | null = null;

const initKeydownListener = () => {
  useKeyboardEventsHooks = useKeyboardEvents(
    { ctrl: true, alt: false, caseSensitive: false, key: "s" },
    async () => {
      try {
        await submitRequest();
        message.success(t("TXT_CODE_8f47d95"));
        emit("save");
      } catch (err: any) {
        return reportErrorMsg(err.message);
      }
    }
  );
  useKeyboardEventsHooks.startKeydownListener();
};

const openDialog = (_path: string, _fileName: string) => {
  fullScreen.value = isPhone.value;
  path.value = _path;
  fileName.value = _fileName;
  open.value = true;
  initKeydownListener();
  return new Promise((_resolve, _reject) => {
    resolve = _resolve;
    reject = _reject;
    void render();
  });
};

const { state: text, execute, isLoading } = fileContent();
const render = async () => {
  try {
    await execute({
      params: {
        daemonId: props.daemonId,
        uuid: props.instanceId
      },
      data: {
        target: path.value
      }
    });

    if (text.value) {
      typeof text.value === "boolean" ? (editorText.value = "") : (editorText.value = text.value);
    }

    openEditor.value = true;
  } catch (err: any) {
    console.error(err.message);
    return reportErrorMsg(err.message);
  }
};

const submitRequest = async () => {
  await execute({
    params: {
      daemonId: props.daemonId,
      uuid: props.instanceId
    },
    data: {
      target: path.value,
      text: editorText.value
    }
  });
};

const submit = async () => {
  try {
    await submitRequest();
    message.success(t("TXT_CODE_a7907771"));
    cancel();
    resolve(editorText.value);
    emit("save");
  } catch (err: any) {
    console.error(err.message);
    reject(err);
    return reportErrorMsg(err.message);
  }
};

const cancel = async () => {
  useKeyboardEventsHooks?.removeKeydownListener();
  open.value = openEditor.value = false;
  resolve(editorText.value);
};

const dialogTitle = computed(() => {
  return fileName.value;
});

defineExpose({
  openDialog
});
</script>

<template>
  <VDialog v-model="open" class="file-editor-dialog app-dialog" :class="{ 'file-editor-dialog--full': fullScreen }"
    :max-width="fullScreen ? undefined : '1600px'" :fullscreen="fullScreen" persistent scrollable>
    <VCard rounded="xl" class="file-editor-card">
      <VCardTitle class="file-editor-title">
        <span>{{ dialogTitle }}</span>
        <VBtn v-if="!isPhone" icon size="small" variant="text" :aria-label="dialogTitle" @click="fullScreen = !fullScreen">
          <VIcon :icon="fullScreen ? 'mdi-fullscreen-exit' : 'mdi-fullscreen'" />
        </VBtn>
      </VCardTitle>
      <VCardText class="file-editor-content">
        <Editor v-if="openEditor" ref="EditorComponent" v-model:text="editorText" :filename="fileName"
          :height="fullScreen ? '100%' : '60vh'" />
        <div v-else class="file-editor-loading"><VProgressCircular indeterminate color="primary" /></div>
      </VCardText>
      <VCardActions><VSpacer /><VBtn variant="text" :disabled="isLoading" @click="cancel">{{ t("TXT_CODE_3b1cc020") }}</VBtn><VBtn color="primary" :loading="isLoading" @click="submit">{{ t("TXT_CODE_abfe9512") }}</VBtn></VCardActions>
    </VCard>
  </VDialog>
</template>

<style lang="scss">
.file-editor-card {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.file-editor-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
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
