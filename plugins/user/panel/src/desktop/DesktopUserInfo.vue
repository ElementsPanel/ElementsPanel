<script setup lang="ts">
import { usePluginService, type FrontendDesktopService } from "@elements-panel/sdk";
import CopyButton from "@elementspanel/epanel-plugin-console/components/CopyButton";
import { PERMISSION_MAP } from "@elementspanel/epanel-plugin-console/config/const";
import { t } from "@elementspanel/epanel-plugin-i18n";
import { bind2FA, confirm2FA, setUserApiKey, updatePassword } from "@elementspanel/epanel-plugin-console/services/apis/user";
import { useAppStateStore } from "@elementspanel/epanel-plugin-console/stores/useAppStateStore";
import { computed, reactive, ref } from "vue";
import { notifyDesktop, notifyDesktopError } from "@elementspanel/epanel-plugin-console/tools/desktopNotice";
import { VBtn, VTextField } from "vuetify/components";

const ConfirmDialog = computed(() => usePluginService<FrontendDesktopService>("desktop")?.confirmation);

const { state, updateUserInfo } = useAppStateStore();

const { execute, isLoading: setUserApiKeyLoading } = setUserApiKey();
const { execute: executeUpdatePassword, isLoading: updatePasswordLoading } = updatePassword();

const formState = reactive({
    resetPassword: false,
    TOTPCode: "",
    password1: "",
    password2: "",
    qrcode: ""
});
const revokeApiKeyDialog = ref(false);

const handleGenerateApiKey = async (enable: boolean) => {
    await execute({
        data: {
            enable
        },
        forceRequest: true,
        errorAlert: true
    });
    updateUserInfo();
    return notifyDesktop(t("TXT_CODE_COMMON_UPDATE_SUCCESSFUL"), "success");
};

const handleChangePassword = async () => {
    if (!formState.password1 || !formState.password2) return notifyDesktop(t("TXT_CODE_COMMON_PLEASE_COMPLETE_YOUR_ACCOUNT_PROFILE"), "error");
    if (formState.password1 !== formState.password2) return notifyDesktopError(t("TXT_CODE_COMMON_PASSWORD_LENGTH_DOES_NOT_MATCH"));
    if (formState.password1.length < 9 || formState.password1.length > 36)
        return notifyDesktopError(t("TXT_CODE_COMMON_PASSWORD_LENGTH_CANNOT_BE_LESS_THAN_9_CHARACTERS"));
    try {
        await executeUpdatePassword({
            data: {
                passWord: formState.password1
            }
        });
        notifyDesktop(t("TXT_CODE_COMMON_UPDATE_SUCCESSFUL"), "success");
        setTimeout(() => {
            window.location.reload();
        }, 600);
    } catch (error: any) {
        return notifyDesktopError(error);
    }
};

const handleBind2FA = async () => {
    const qrcode = await bind2FA().execute({
        data: {}
    });
    if (qrcode.value) {
        formState.qrcode = String(qrcode.value);
        await updateUserInfo();
    }
};

const confirm2FACode = async () => {
    const TOTPCode = formState.TOTPCode;
    try {
        await confirm2FA().execute({
            data: {
                enable: true,
                TOTPCode
            }
        });
    } catch {
        return notifyDesktop(t("TXT_CODE_COMMON_TWO_FACTOR_AUTHENTICATION_CODE_IS_INCORRECT"), "error");
    }
    notifyDesktop(t("TXT_CODE_COMMON_UPDATE_SUCCESSFUL"), "success");
    await updateUserInfo();
    formState.TOTPCode = "";
    formState.qrcode = "";
};

const disable2FACode = async () => {
    await confirm2FA().execute({
        data: {
            enable: false,
            TOTPCode: "000000"
        }
    });
    notifyDesktop(t("TXT_CODE_COMMON_UPDATE_SUCCESSFUL"), "success");
    await updateUserInfo();
    formState.qrcode = "";
};
</script>

<template>
    <div class="desktop-user-info">
        <div class="info-section">
            <h3 class="section-title">{{ t('TXT_CODE_UI_ACCOUNT') }}</h3>
            <div class="info-grid">
                <div class="info-item">
                    <span class="info-label">{{ t('TXT_CODE_USER_USERNAME') }}</span>
                    <span class="info-value">{{ state.userInfo?.userName }}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">{{ t('TXT_CODE_USER_PERMISSION_LEVEL') }}</span>
                    <span class="info-value">{{ PERMISSION_MAP[String(state.userInfo?.permission)] }}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">{{ t('TXT_CODE_COMMON_REGISTRATION_TIME') }}</span>
                    <span class="info-value">{{ state.userInfo?.registerTime }}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">{{ t('TXT_CODE_COMMON_LAST_LOGIN') }}</span>
                    <span class="info-value">{{ state.userInfo?.loginTime }}</span>
                </div>
                <div class="info-item full-width">
                    <span class="info-label">{{ t('TXT_CODE_COMMON_UUID') }}</span>
                    <span class="info-value">{{ state.userInfo?.uuid }}</span>
                </div>
            </div>
        </div>

        <div class="info-section">
            <h3 class="section-title">{{ t('TXT_CODE_COMMON_PASSWORD') }}</h3>
            <div v-if="!formState.resetPassword">
                <VBtn color="error" variant="text" @click="formState.resetPassword = true">
                    {{ t("TXT_CODE_COMMON_CHANGE") }}
                </VBtn>
            </div>
            <div v-else class="password-form">
                <VTextField v-model="formState.password1" type="password" hide-details :placeholder="t('TXT_CODE_COMMON_PLEASE_ENTER_NEW_PASSWORD')" />
                <VTextField v-model="formState.password2" type="password" hide-details :placeholder="t('TXT_CODE_COMMON_PLEASE_RE_ENTER_THE_NEW_PASSWORD')" />
                <div class="form-actions">
                    <VBtn variant="text" @click="formState.resetPassword = false">{{ t("TXT_CODE_COMMON_DISCARD") }}</VBtn>
                    <VBtn color="primary" variant="text" :loading="updatePasswordLoading" @click="handleChangePassword">
                        {{ t("TXT_CODE_COMMON_CONFIRM") }}
                    </VBtn>
                </div>
            </div>
        </div>

        <div class="info-section">
            <h3 class="section-title">{{ t('TXT_CODE_COMMON_TWO_FACTOR_AUTHENTICATION') }}</h3>
            <div v-if="!formState?.qrcode">
                <VBtn class="mr-2" variant="text" @click="handleBind2FA">
                    {{ state.userInfo?.open2FA ? t("TXT_CODE_COMMON_REBIND") : t("TXT_CODE_COMMON_START_BINDING") }}
                </VBtn>
                <VBtn v-if="state.userInfo?.open2FA" color="error" variant="text" @click="disable2FACode">
                    {{ t("TXT_CODE_USER_ACCOUNT_DISABLE") }}
                </VBtn>
            </div>
            <div v-if="formState?.qrcode" class="two-fa-setup">
                <p class="two-fa-instructions">
                    1. {{ t("TXT_CODE_COMMON_SCAN_THE_QR_CODE_USING_GOOGLE_AUTHENTICATION_OR_OTHER_UNIVERSAL_2_FA_TOOLS") }}<br />
                    2. {{ t("TXT_CODE_COMMON_ENTER_THE_TOTP_VERIFICATION_CODE_IN_THE_BOX_BELOW") }}<br />
                    3. {{ t("TXT_CODE_COMMON_CLICK_THE_I_HAVE_SCANNED_BUTTON") }}<br />
                </p>
                <div class="qrcode-container">
                    <img :src="formState.qrcode" :alt="t('TXT_CODE_UI_2_FA_QR_CODE')" />
                </div>
                <div class="two-fa-form">
                    <VTextField v-model="formState.TOTPCode" hide-details :placeholder="t('TXT_CODE_COMMON_PLEASE_ENTER_THE_TWO_FACTOR_AUTHENTICATION_CODE')" />
                    <VBtn color="primary" variant="text" :loading="setUserApiKeyLoading" @click="confirm2FACode">
                        {{ t("TXT_CODE_COMMON_I_HAVE_SCANNED") }}
                    </VBtn>
                    <VBtn variant="text" @click="formState.qrcode = ''">{{ t("TXT_CODE_COMMON_DISCARD") }}</VBtn>
                </div>
            </div>
        </div>

        <div class="info-section">
            <h3 class="section-title">{{ t("TXT_CODE_UI_API_KEY") }}</h3>
            <p class="api-key-desc">{{ t("TXT_CODE_COMMON_REQUESTS_USING_THIS_KEY_HAVE_THE_SAME_PERMISSIONS_AS_THIS_ACCOUNT") }}</p>

            <div v-if="state.userInfo?.apiKey" class="api-key-display">
                <span class="api-key-text">{{ state.userInfo.apiKey }}</span>
                <CopyButton size="small" type="text" :value="state.userInfo.apiKey" />
            </div>
            <div v-else class="api-key-display empty">
                <span class="api-key-text">{{ t("TXT_CODE_COMMON_DISABLED") }}</span>
            </div>

            <div class="api-key-actions">
                <VBtn color="primary" variant="text" :loading="setUserApiKeyLoading" @click="handleGenerateApiKey(true)">
                    {{ t("TXT_CODE_COMMON_GENERATE_NEW_KEY") }}
                </VBtn>
                <VBtn v-if="state.userInfo?.apiKey" color="error" variant="text" @click="revokeApiKeyDialog = true">
                    {{ t("TXT_CODE_COMMON_DISABLE") }}
                </VBtn>
            </div>
        </div>

        <component :is="ConfirmDialog" v-if="ConfirmDialog" v-model="revokeApiKeyDialog" :title="t('TXT_CODE_USER_DISABLE_API_KEY')"
            :message="t('TXT_CODE_COMMON_DISABLING_THIS_KEY_PREVENTS_IT_FROM_AUTHENTICATING_REQUESTS')" danger :ok-text="t('TXT_CODE_COMMON_DISABLE')" :cancel-text="t('TXT_CODE_COMMON_DISCARD')"
            @confirm="revokeApiKeyDialog = false; handleGenerateApiKey(false)" />
    </div>
</template>

<style lang="scss" scoped>
.desktop-user-info {
    padding: 24px;
    height: 100%;
    overflow-y: auto;
    color: var(--desktop-window-text);
}

.info-section {
    background: var(--desktop-window-titlebar-bg);
    border: 1px solid var(--desktop-window-border);
    border-radius: 8px;
    padding: 20px;
    margin-bottom: 20px;

    &:last-child {
        margin-bottom: 0;
    }
}

.section-title {
    font-size: 16px;
    font-weight: 600;
    margin-top: 0;
    margin-bottom: 16px;
    color: var(--desktop-window-text);
    border-bottom: 1px solid var(--desktop-window-border);
    padding-bottom: 12px;
}

.info-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
}

.info-item {
    display: flex;
    flex-direction: column;
    gap: 4px;

    &.full-width {
        grid-column: 1 / -1;
    }
}

.info-label {
    font-size: 12px;
    color: var(--desktop-window-text-secondary);
}

.info-value {
    font-size: 14px;
    background: var(--desktop-window-titlebar-bg);
    padding: 6px 12px;
    border-radius: 4px;
    border: 1px solid var(--desktop-window-border);
    word-break: break-all;
}

.password-form {
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-width: 300px;
}

.form-actions {
    display: flex;
    gap: 8px;
    margin-top: 4px;
}

.two-fa-setup {
    background: var(--desktop-window-titlebar-bg);
    padding: 16px;
    border-radius: 6px;
    border: 1px solid var(--desktop-window-border);
}

.two-fa-instructions {
    font-size: 13px;
    color: var(--desktop-window-text-secondary);
    line-height: 1.6;
    margin-top: 0;
    margin-bottom: 16px;
}

.qrcode-container {
    margin-bottom: 16px;

    img {
        height: 160px;
        border-radius: 6px;
        border: 4px solid #fff;
    }
}

.two-fa-form {
    display: flex;
    gap: 8px;
    max-width: 400px;
}

.api-key-desc {
    font-size: 13px;
    color: var(--desktop-window-text-secondary);
    margin-top: 0;
    margin-bottom: 12px;
}

.api-key-display {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--desktop-window-titlebar-bg);
    padding: 10px 12px;
    border-radius: 6px;
    border: 1px solid var(--desktop-window-border);
    margin-bottom: 16px;
    font-family: monospace;

    &.empty {
        color: var(--desktop-window-text-muted);
        justify-content: flex-start;
    }
}

.api-key-text {
    word-break: break-all;
    margin-right: 12px;
}

.api-key-actions {
    display: flex;
    gap: 8px;
}
</style>
