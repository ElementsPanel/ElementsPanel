<script setup lang="ts">
import Editor from "@/components/Editor.vue";
import { useKeyboardEvents } from "@/hooks/useKeyboardEvents";
import { t } from "@/lang/i18n";
import { fileContent } from "../api";
import { notifyDesktop, notifyDesktopError } from "../../../desktop/src/desktopNotice";
import { onMounted, ref } from "vue";
import { VBtn, VIcon, VSkeletonLoader } from "vuetify/components";

const props = defineProps<{
    daemonId: string;
    instanceId: string;
    filePath: string;
    fileName: string;
}>();

const emit = defineEmits<{
    (e: "save"): void;
    (e: "close"): void;
}>();

const editorText = ref("");
const isLoading = ref(true);
const editorRoot = ref<HTMLElement | null>(null);

let useKeyboardEventsHooks: ReturnType<typeof useKeyboardEvents> | null = null;

const initKeydownListener = () => {
    useKeyboardEventsHooks = useKeyboardEvents(
        { ctrl: true, alt: false, caseSensitive: false, key: "s" },
        async () => {
            if (editorRoot.value && !editorRoot.value.contains(document.activeElement)) {
                return;
            }
            try {
                await submitRequest();
                notifyDesktop(t("TXT_CODE_8f47d95"), "success");
                emit("save");
            } catch (err: any) {
                return notifyDesktopError(err);
            }
        }
    );
    useKeyboardEventsHooks.startKeydownListener();
};

const { state: text, execute } = fileContent();

const loadContent = async () => {
    isLoading.value = true;
    try {
        await execute({
            params: {
                daemonId: props.daemonId,
                uuid: props.instanceId
            },
            data: {
                target: props.filePath
            }
        });

        if (text.value) {
            typeof text.value === "boolean" ? (editorText.value = "") : (editorText.value = text.value);
        }
    } catch (err: any) {
        console.error(err.message);
        notifyDesktopError(err);
    } finally {
        isLoading.value = false;
    }
};

const submitRequest = async () => {
    await execute({
        params: {
            daemonId: props.daemonId,
            uuid: props.instanceId
        },
        data: {
            target: props.filePath,
            text: editorText.value
        }
    });
};

const submit = async () => {
    try {
        await submitRequest();
        notifyDesktop(t("TXT_CODE_a7907771"), "success");
        emit("save");
    } catch (err: any) {
        console.error(err.message);
        notifyDesktopError(err);
    }
};

const close = () => {
    useKeyboardEventsHooks?.removeKeydownListener();
    emit("close");
};

onMounted(() => {
    initKeydownListener();
    loadContent();
});
</script>

<template>
    <div ref="editorRoot" class="dfe">
        <div class="dfe-toolbar">
            <div class="dfe-toolbar__left">
                <span class="dfe-filename">{{ fileName }}</span>
            </div>
            <div class="dfe-toolbar__right">
                <VBtn class="dfe-btn dfe-btn--primary" variant="text" size="small" :disabled="isLoading" @click="submit">
                    <VIcon icon="mdi-content-save-outline" />
                    {{ t("TXT_CODE_abfe9512") }}
                </VBtn>
                <VBtn class="dfe-btn" variant="text" size="small" @click="close">
                    <VIcon icon="mdi-close" />
                    {{ t("TXT_CODE_3b1cc020") }}
                </VBtn>
            </div>
        </div>
        <div class="dfe-body">
            <Editor v-if="!isLoading" v-model:text="editorText" :filename="fileName" height="100%" />
            <div v-else class="dfe-loading">
                <VSkeletonLoader type="paragraph, paragraph, paragraph, paragraph" />
            </div>
        </div>
    </div>
</template>

<style lang="scss" scoped>
.dfe {
    height: 100%;
    display: flex;
    flex-direction: column;
    color: var(--desktop-window-text);
    font-size: 13px;
    overflow: hidden;
}

.dfe-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 12px;
    flex-shrink: 0;

    &__left,
    &__right {
        display: flex;
        align-items: center;
        gap: 6px;
    }
}

.dfe-filename {
    font-size: 13px;
    font-weight: 500;
    color: var(--desktop-window-text);
}

.dfe-btn {
    background: var(--desktop-window-titlebar-bg);
    color: var(--desktop-window-text);

    &:hover:not(:disabled) {
        background: var(--desktop-window-control-hover);
    }

    &:disabled {
        opacity: 0.4;
        cursor: not-allowed;
    }

    &--primary {
        color: #52c41a;
        background: rgba(82, 196, 26, 0.1);

        &:hover:not(:disabled) {
            background: rgba(82, 196, 26, 0.2);
        }
    }
}

.dfe-body {
    flex: 1;
    overflow: hidden;
    padding: 8px;
}

.dfe-loading {
    padding: 16px;
}
</style>
