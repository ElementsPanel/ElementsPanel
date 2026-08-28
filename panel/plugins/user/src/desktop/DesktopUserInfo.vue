<script setup lang="ts">
import CopyButton from "@/components/CopyButton.vue";
import { PERMISSION_MAP } from "@/config/const";
import { t } from "@/lang/i18n";
import { bind2FA, confirm2FA, setUserApiKey, updatePassword } from "@/services/apis/user";
import { useAppStateStore } from "@/stores/useAppStateStore";
import { reportErrorMsg } from "@/tools/validator";
import { message } from "ant-design-vue";
import { reactive } from "vue";

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

const handleGenerateApiKey = async (enable: boolean) => {
    await execute({
        data: {
            enable
        },
        forceRequest: true,
        errorAlert: true
    });
    updateUserInfo();
    return message.success(t("TXT_CODE_d3de39b4"));
};

const handleChangePassword = async () => {
    if (!formState.password1 || !formState.password2) return message.error(t("TXT_CODE_c846074d"));
    if (formState.password1 !== formState.password2) return reportErrorMsg(t("TXT_CODE_d51f5d6"));
    if (formState.password1.length < 9 || formState.password1.length > 36)
        return reportErrorMsg(t("TXT_CODE_cc5a3aea"));
    try {
        await executeUpdatePassword({
            data: {
                passWord: formState.password1
            }
        });
        message.success(t("TXT_CODE_d3de39b4"));
        setTimeout(() => {
            window.location.reload();
        }, 600);
    } catch (error: any) {
        return reportErrorMsg(error.message);
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
        return message.error(t("TXT_CODE_3d68e43b"));
    }
    message.success(t("TXT_CODE_d3de39b4"));
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
    message.success(t("TXT_CODE_d3de39b4"));
    await updateUserInfo();
    formState.qrcode = "";
};
</script>

<template>
    <div class="desktop-user-info">
        <div class="info-section">
            <h3 class="section-title">{{ t('TXT_CODE_9bb2f08b') }}</h3>
            <div class="info-grid">
                <div class="info-item">
                    <span class="info-label">{{ t('TXT_CODE_eb9fcdad') }}</span>
                    <span class="info-value">{{ state.userInfo?.userName }}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">{{ t('TXT_CODE_63ccbf90') }}</span>
                    <span class="info-value">{{ PERMISSION_MAP[String(state.userInfo?.permission)] }}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">{{ t('TXT_CODE_c5c56801') }}</span>
                    <span class="info-value">{{ state.userInfo?.registerTime }}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">{{ t('TXT_CODE_d7ee9ba') }}</span>
                    <span class="info-value">{{ state.userInfo?.loginTime }}</span>
                </div>
                <div class="info-item full-width">
                    <span class="info-label">{{ t('TXT_CODE_1d9d0746') }}</span>
                    <span class="info-value">{{ state.userInfo?.uuid }}</span>
                </div>
            </div>
        </div>

        <div class="info-section">
            <h3 class="section-title">{{ t('TXT_CODE_551b0348') }}</h3>
            <div v-if="!formState.resetPassword">
                <a-button danger @click="formState.resetPassword = true">
                    {{ t("TXT_CODE_50d471b2") }}
                </a-button>
            </div>
            <div v-else class="password-form">
                <a-input v-model:value="formState.password1" type="password" :placeholder="t('TXT_CODE_4f6c39d3')" />
                <a-input v-model:value="formState.password2" type="password" :placeholder="t('TXT_CODE_37924654')" />
                <div class="form-actions">
                    <a-button @click="formState.resetPassword = false">{{ t("TXT_CODE_3b1cc020") }}</a-button>
                    <a-button type="primary" :loading="updatePasswordLoading" @click="handleChangePassword">
                        {{ t("TXT_CODE_d507abff") }}
                    </a-button>
                </div>
            </div>
        </div>

        <div class="info-section">
            <h3 class="section-title">{{ t('TXT_CODE_61eae8a6') }}</h3>
            <div v-if="!formState?.qrcode">
                <a-button class="mr-8" @click="handleBind2FA">
                    {{ state.userInfo?.open2FA ? t("TXT_CODE_85a33a84") : t("TXT_CODE_a492ae63") }}
                </a-button>
                <a-button v-if="state.userInfo?.open2FA" danger @click="disable2FACode">
                    {{ t("TXT_CODE_edd64e4d") }}
                </a-button>
            </div>
            <div v-if="formState?.qrcode" class="two-fa-setup">
                <p class="two-fa-instructions">
                    1. {{ t("TXT_CODE_cc561947") }}<br />
                    2. {{ t("TXT_CODE_fffce4a8") }}<br />
                    3. {{ t("TXT_CODE_af2a6972") }}<br />
                </p>
                <div class="qrcode-container">
                    <img :src="formState.qrcode" alt="2FA QR Code" />
                </div>
                <div class="two-fa-form">
                    <a-input v-model:value="formState.TOTPCode" :placeholder="t('TXT_CODE_7ac8b1d3')" />
                    <a-button type="primary" :loading="setUserApiKeyLoading" @click="confirm2FACode">
                        {{ t("TXT_CODE_b0a18c20") }}
                    </a-button>
                    <a-button @click="formState.qrcode = ''">{{ t("TXT_CODE_3b1cc020") }}</a-button>
                </div>
            </div>
        </div>

        <div class="info-section">
            <h3 class="section-title">APIKEY</h3>
            <p class="api-key-desc">{{ t("TXT_CODE_b2dbf778") }}</p>

            <div v-if="state.userInfo?.apiKey" class="api-key-display">
                <span class="api-key-text">{{ state.userInfo.apiKey }}</span>
                <CopyButton size="small" type="text" :value="state.userInfo.apiKey" />
            </div>
            <div v-else class="api-key-display empty">
                <span class="api-key-text">{{ t("TXT_CODE_d7dbc7c2") }}</span>
            </div>

            <div class="api-key-actions">
                <a-button type="primary" :loading="setUserApiKeyLoading" @click="handleGenerateApiKey(true)">
                    {{ t("TXT_CODE_d51cd7ae") }}
                </a-button>
                <a-popconfirm v-if="state.userInfo?.apiKey" :title="t('TXT_CODE_6819de18')"
                    @confirm="handleGenerateApiKey(false)">
                    <a-button danger> {{ t("TXT_CODE_718c9310") }} </a-button>
                </a-popconfirm>
            </div>
        </div>
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

.mr-8 {
    margin-right: 8px;
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
