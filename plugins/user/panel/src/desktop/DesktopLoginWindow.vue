<script setup lang="ts">
import { router } from "@elementspanel/epanel-plugin-console/config/router";
import { t } from "@elementspanel/epanel-plugin-i18n";
import { useAppConfigStore } from "@elementspanel/epanel-plugin-console/stores/useAppConfigStore";
import { onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { useDesktopLogin } from "../hooks/useDesktopLogin";
import { desktopIconDarkUrl, desktopIconUrl } from "../assets";
import { VBtn, VIcon, VTextField } from "vuetify/components";

const AppstoreOutlined = "mdi-view-grid-outline";
const LoadingOutlined = "mdi-loading";
const LockOutlined = "mdi-lock-outline";
const UserOutlined = "mdi-account-outline";

const emit = defineEmits<{
  (e: "login-success"): void;
}>();

const { formData, loginStep, is2Fa, handleLogin, handleNext } = useDesktopLogin(() =>
  emit("login-success")
);

const { isDarkTheme } = useAppConfigStore();

const windowRef = ref<HTMLElement | null>(null);
const pos = reactive({ x: 0, y: 0 });
const isDragging = ref(false);
const dragStart = reactive({ x: 0, y: 0 });

const fitWindow = () => {
  const bounds = windowRef.value?.getBoundingClientRect();
  const width = Math.min(bounds?.width || 380, window.innerWidth);
  const height = Math.min(bounds?.height || 460, window.innerHeight);
  pos.x = Math.max(0, Math.min(pos.x, window.innerWidth - width));
  pos.y = Math.max(0, Math.min(pos.y, window.innerHeight - height));
};

const centerWindow = () => {
  const bounds = windowRef.value?.getBoundingClientRect();
  pos.x = Math.round((window.innerWidth - (bounds?.width || 380)) / 2);
  pos.y = Math.round((window.innerHeight - (bounds?.height || 460)) / 2);
  fitWindow();
};

const onMouseDown = (e: MouseEvent) => {
  const target = e.target as HTMLElement;
  if (target.closest("input") || target.closest("button") || target.closest("a")) return;
  isDragging.value = true;
  dragStart.x = e.clientX - pos.x;
  dragStart.y = e.clientY - pos.y;
  e.preventDefault();
};

const isOutsideBrowser = (e: MouseEvent) => {
  return (
    e.clientX <= 0 ||
    e.clientX >= window.innerWidth - 1 ||
    e.clientY <= 0 ||
    e.clientY >= window.innerHeight - 1
  );
};

const onMouseMove = (e: MouseEvent) => {
  if (!isDragging.value) return;
  if (isOutsideBrowser(e)) {
    isDragging.value = false;
    return;
  }
  pos.x = e.clientX - dragStart.x;
  pos.y = e.clientY - dragStart.y;
};

const onMouseUp = () => {
  isDragging.value = false;
};

onMounted(() => {
  centerWindow();
  window.addEventListener("resize", fitWindow);
  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", fitWindow);
  document.removeEventListener("mousemove", onMouseMove);
  document.removeEventListener("mouseup", onMouseUp);
});
</script>

<template>
    <div class="desktop-login-overlay">
        <div ref="windowRef" class="desktop-login-window"
            :class="{ 'is-logging': loginStep === 1, 'is-dragging': isDragging }"
            :style="{ left: pos.x + 'px', top: pos.y + 'px' }">
            <div class="window__titlebar" @mousedown="onMouseDown">
                <div class="window__titlebar-left">
                    <span class="window__icon">
                        <img class="window__logo-img" :src="isDarkTheme ? desktopIconUrl : desktopIconDarkUrl"
                            alt="logo" />
                    </span>
                    <span class="window__title">ElementsPanel</span>
                </div>
                <div class="window__controls">
                    <VBtn class="window__control" icon variant="text"
                        :title="t('TXT_CODE_DESKTOP_EXIT')" :aria-label="t('TXT_CODE_DESKTOP_EXIT')"
                        @click="router.push('/login')">
                        <VIcon icon="mdi-view-grid-outline" />
                    </VBtn>
                </div>
            </div>

            <div v-show="loginStep <= 1" class="desktop-login-body">
                <p class="desktop-login-subtitle">{{ t("TXT_CODE_COMMON_LOGIN_TO_ELEMENTS_PANEL_CONTROL_PANEL") }}</p>
                <form class="desktop-login-form" @submit.prevent="handleLogin">
                    <div v-if="!is2Fa" class="desktop-login-fields-group">
                        <VTextField v-model="formData.username" type="text" :placeholder="t('TXT_CODE_LOGIN_ACCOUNT_NAME')"
                            prepend-inner-icon="mdi-account-outline" autocomplete="username"
                            hide-details :disabled="loginStep === 1" />
                        <VTextField v-model="formData.password" type="password" :placeholder="t('TXT_CODE_COMMON_PASSWORD')"
                            prepend-inner-icon="mdi-lock-outline" autocomplete="current-password"
                            hide-details @keydown.enter="handleLogin" :disabled="loginStep === 1" />
                    </div>
                    <div v-else>
                        <VTextField v-model="formData.code" type="text" :placeholder="t('TXT_CODE_COMMON_PLEASE_ENTER_THE_TWO_FACTOR_AUTHENTICATION_CODE')"
                            prepend-inner-icon="mdi-lock-outline" autocomplete="off"
                            hide-details @keydown.enter="handleLogin" :disabled="loginStep === 1" />
                    </div>
                    <VBtn type="submit" class="desktop-login-btn" block variant="flat"
                        :loading="loginStep === 1" :disabled="loginStep === 1">
                        <VIcon v-if="loginStep === 1" icon="mdi-loading" class="mr-2" />
                        {{ loginStep === 1 ? t("TXT_CODE_DESKTOP_LOGGING_IN") : t("TXT_CODE_LOGIN_SUBMIT") }}
                    </VBtn>
                </form>
                <div class="desktop-login-footer">
                    Powered by
                    <a href="https://github.com/ElementsPanel/ElementsPanel" target="_blank"
                        rel="noopener noreferrer">ElementsPanel</a>
                </div>
            </div>

        </div>
    </div>
</template>

<style lang="scss" scoped>
.desktop-login-overlay {
    position: absolute;
    inset: 0;
    z-index: 500;
    background: var(--desktop-login-overlay);
}

.desktop-login-window {
    position: absolute;
    width: 380px;
    max-width: 100vw;
    max-height: 100vh;
    box-sizing: border-box;
    border: 1px solid var(--desktop-window-border);
    border-radius: 10px;
    box-shadow: 0 8px 32px var(--desktop-window-shadow);
    overflow: hidden;
    animation: loginWindowAppear 0.5s cubic-bezier(0.16, 1, 0.3, 1);
    display: flex;
    flex-direction: column;
    transition: border-radius 0.2s ease, box-shadow 0.2s ease;

    &.is-dragging {
        opacity: 1;
        transition: none;
    }
}

@keyframes loginWindowAppear {
    from {
        opacity: 0;
    }

    to {
        opacity: 1;
    }
}

.window__titlebar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 38px;
    padding: 0 8px 0 12px;
    background: var(--desktop-window-titlebar-bg);
    cursor: default;
    user-select: none;
    flex-shrink: 0;

    &-left {
        display: flex;
        align-items: center;
        gap: 8px;
        overflow: hidden;
    }
}

.window__icon {
    font-size: 14px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    color: var(--desktop-window-text);
}

.window__logo-img {
    width: 14px;
    height: 14px;
}

.window__title {
    font-size: 12px;
    color: var(--desktop-window-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.window__controls {
    display: flex;
    align-items: center;
    gap: 2px;
    flex-shrink: 0;
}

.window__control {
    width: 32px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    cursor: pointer;
    color: var(--desktop-window-text-secondary);
    font-size: 12px;
    transition: background-color 0.12s;

    &:hover {
        background-color: var(--desktop-window-control-hover);
        color: var(--desktop-window-text);
    }
}

.desktop-login-body {
    padding: 20px 28px 28px;
    min-height: 0;
    overflow-y: auto;
}

.desktop-login-subtitle {
    text-align: center;
    color: var(--desktop-window-text-muted);
    font-size: 13px;
    margin: 0 0 20px;
}

.desktop-login-form,
.desktop-login-fields-group {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.desktop-login-btn {
    margin-top: 4px;
    padding: 10px 0;
    background: #1677ff;
    border: none;
    border-radius: 8px;
    color: #fff;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;

    &:hover:not(:disabled) {
        background: #4096ff;
    }

    &:active:not(:disabled) {
        transform: translateY(0);
    }

    &:disabled {
        opacity: 0.7;
        cursor: not-allowed;
    }
}

.desktop-login-footer {
    text-align: center;
    margin-top: 16px;
    font-size: 12px;
    color: var(--desktop-login-footer-text);

    a {
        color: var(--desktop-login-footer-link);
        text-decoration: underline;

        &:hover {
            color: var(--desktop-login-footer-link-hover);
        }
    }
}

</style>
