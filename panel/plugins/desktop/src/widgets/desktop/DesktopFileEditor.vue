<script setup lang="ts">
import Editor from "@/components/Editor.vue";
import { useKeyboardEvents } from "@/hooks/useKeyboardEvents";
import { t } from "@/lang/i18n";
import { fileContent } from "@/services/apis/fileManager";
import { reportErrorMsg } from "@/tools/validator";
import { message } from "ant-design-vue";
import { onMounted, ref } from "vue";

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
                message.success(t("TXT_CODE_8f47d95"));
                emit("save");
            } catch (err: any) {
                return reportErrorMsg(err.message);
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
        reportErrorMsg(err.message);
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
        message.success(t("TXT_CODE_a7907771"));
        emit("save");
    } catch (err: any) {
        console.error(err.message);
        reportErrorMsg(err.message);
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
                <button class="dfe-btn dfe-btn--primary" :disabled="isLoading" @click="submit">
                    {{ t("TXT_CODE_abfe9512") }}
                </button>
                <button class="dfe-btn" @click="close">
                    {{ t("TXT_CODE_3b1cc020") }}
                </button>
            </div>
        </div>
        <div class="dfe-body">
            <Editor v-if="!isLoading" v-model:text="editorText" :filename="fileName" height="100%" />
            <div v-else class="dfe-loading">
                <a-skeleton :paragraph="{ rows: 12 }" active />
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
    border-bottom: 1px solid var(--desktop-window-border);
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
    border: 1px solid var(--desktop-window-border);
    border-radius: 6px;
    color: var(--desktop-window-text);
    padding: 4px 12px;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.2s;
    display: inline-flex;
    align-items: center;
    gap: 4px;

    &:hover:not(:disabled) {
        background: var(--desktop-window-control-hover);
    }

    &:disabled {
        opacity: 0.4;
        cursor: not-allowed;
    }

    &--primary {
        color: #52c41a;
        border-color: rgba(82, 196, 26, 0.3);
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
