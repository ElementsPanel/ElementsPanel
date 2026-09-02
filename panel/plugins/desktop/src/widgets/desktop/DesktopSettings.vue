<script setup lang="ts">
import type { FrontendFileManagerService } from "@/plugin";
import { usePluginService } from "@/plugin/context";
import { SUPPORTED_LANGS, t } from "@/lang/i18n";
import { setSettingInfo, settingInfo } from "@/services/apis";
import { useAppConfigStore } from "@/stores/useAppConfigStore";
import { useLayoutConfigStore } from "@/stores/useLayoutConfig";
import type { Settings } from "@/types";
import {
    PicLeftOutlined,
    ProjectOutlined,
    QuestionCircleOutlined,
    SaveOutlined,
    UploadOutlined
} from "@ant-design/icons-vue";
import { computed, onMounted, ref } from "vue";

const { execute, isReady } = settingInfo();
const { execute: submitExecute, isLoading: submitIsLoading } = setSettingInfo();
const { getSettingsConfig, setSettingsConfig } = useLayoutConfigStore();
const { setLogoImage, setBackgroundImage } = useAppConfigStore();

interface MySettings extends Settings {
    pageTitle?: string;
    logoUrl?: string;
    bgUrl?: string;
}

const formData = ref<MySettings>();
const activeTab = ref("baseInfo");
const saveMessage = ref("");
const saveError = ref("");

const sidebarPosition = ref<"left" | "right">("left");

const tabs = [
    { key: "baseInfo", title: t("TXT_CODE_cdd555be"), icon: ProjectOutlined },
    { key: "ui", title: t("TXT_CODE_1c18acc0"), icon: PicLeftOutlined },
    { key: "about", title: t("TXT_CODE_3b4b656d"), icon: QuestionCircleOutlined }
];

const allLanguages = SUPPORTED_LANGS;

const allYesNo = [
    { label: t("TXT_CODE_52c8a730"), value: true },
    { label: t("TXT_CODE_718c9310"), value: false }
];

const sidebarPositionOptions = [
    { label: t("TXT_CODE_SETTINGS_LAYOUT_SIDEBAR_POSITION_LEFT"), value: "left" as const },
    { label: t("TXT_CODE_SETTINGS_LAYOUT_SIDEBAR_POSITION_RIGHT"), value: "right" as const }
];

onMounted(async () => {
    try {
        const res = await execute();
        const cfg = await getSettingsConfig();
        formData.value = res.value!;
        const fd = formData.value as any;

        if (cfg?.theme?.logoImage) formData.value.logoUrl = cfg.theme.logoImage;
        if (cfg?.theme?.backgroundImage) formData.value.bgUrl = cfg.theme.backgroundImage;
        formData.value.pageTitle = cfg?.theme?.pageTitle || t("TXT_CODE_47ae8ee6");

        if (cfg?.theme?.sidebarPosition === "left" || cfg?.theme?.sidebarPosition === "right") {
            sidebarPosition.value = cfg.theme.sidebarPosition;
        }
    } catch (error) {
        console.error("Failed to load settings", error);
    }
});

/**
 * The file picker belongs to `plugins/file`. Without it this answers with
 * an empty path and the existing "no url" branches leave the images alone.
 */
const useUploadFileDialog = async () =>
    (await usePluginService<FrontendFileManagerService>("file")?.useUploadFileDialog()) ?? "";

const uploadLogo = async () => {
    if (formData.value) {
        const url = await useUploadFileDialog();
        if (url) {
            formData.value.logoUrl = url;
            setLogoImage(url);
        }
    }
};

const uploadBackground = async () => {
    if (formData.value) {
        const url = await useUploadFileDialog();
        if (url) {
            formData.value.bgUrl = url;
            setBackgroundImage(url);
        }
    }
};

const showMessage = (msg: string, isError = false) => {
    if (isError) {
        saveError.value = msg;
        saveMessage.value = "";
    } else {
        saveMessage.value = msg;
        saveError.value = "";
    }
    setTimeout(() => {
        saveMessage.value = "";
        saveError.value = "";
    }, 3000);
};

const submit = async (needReload: boolean = true) => {
    if (!formData.value) return;

    saveMessage.value = "";
    saveError.value = "";

    try {
        await submitExecute({
            data: { ...formData.value }
        });

        const cfg = await getSettingsConfig();
        if (cfg) {
            if (!cfg.theme) cfg.theme = { pageTitle: "", logoImage: "", backgroundImage: "" };
            cfg.theme.pageTitle = formData.value.pageTitle?.trim() || t("TXT_CODE_47ae8ee6");
            cfg.theme.logoImage = formData.value.logoUrl || "";
            cfg.theme.backgroundImage = formData.value.bgUrl || "";
            cfg.theme.sidebarPosition = sidebarPosition.value;
            await setSettingsConfig(cfg);
        }

        showMessage(t("TXT_CODE_a7907771"));
        if (needReload) {
            setTimeout(() => window.location.reload(), 1000);
        }
    } catch (error: any) {
        showMessage(error.message || "Save failed", true);
    }
};

const handleSave = () => {
    submit(activeTab.value === 'ui');
};

const ApacheLicense = `Copyright ${new Date().getFullYear()} MCSManager

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.`;
</script>

<template>
    <div class="desktop-settings">
        <div v-if="!isReady || !formData" class="ds-loading">
            {{ t("TXT_CODE_b197be11") }}
        </div>
        <template v-else>
            <div class="ds-sidebar">
                <div v-for="tab in tabs" :key="tab.key" class="ds-tab"
                    :class="{ 'ds-tab--active': activeTab === tab.key }" @click="activeTab = tab.key">
                    <component :is="tab.icon" class="ds-tab__icon" />
                    <span>{{ tab.title }}</span>
                </div>
            </div>

            <div class="ds-content">
                <div class="ds-content__scroll">
                    <div v-show="activeTab === 'baseInfo'" class="ds-form">
                        <h2 class="ds-title">{{ t("TXT_CODE_5206cf41") }}</h2>

                        <div class="ds-form-group">
                            <label class="ds-label">{{ t("TXT_CODE_a1a59b08") }}</label>
                            <p class="ds-desc">{{ t("TXT_CODE_2abeb185") }} {{ t("TXT_CODE_d648ff91") }}</p>
                            <select v-model="formData.language" class="ds-select">
                                <option v-for="item in allLanguages" :key="item.value" :value="item.value">
                                    {{ item.label }}
                                </option>
                            </select>
                        </div>

                        <div class="ds-form-group">
                            <label class="ds-label">Panel ID</label>
                            <p class="ds-desc">
                                {{ t("TXT_CODE_e2976753") }}<br />
                                {{ formData.panelId ? t("TXT_CODE_e56cced3") : t("TXT_CODE_699b4b66") }}
                            </p>
                            <input v-model="formData.panelId" class="ds-input" :placeholder="t('TXT_CODE_4ea93630')" />
                        </div>
                    </div>

                    <div v-show="activeTab === 'ui'" class="ds-form">
                        <h2 class="ds-title">{{ t("TXT_CODE_1c18acc0") }}</h2>

                        <div class="ds-form-group">
                            <label class="ds-label">{{ t("TXT_CODE_SETTINGS_LAYOUT_SIDEBAR_POSITION_TITLE") }}</label>
                            <p class="ds-desc">{{ t("TXT_CODE_SETTINGS_LAYOUT_SIDEBAR_POSITION_DESCRIPTION") }}</p>
                            <select v-model="sidebarPosition" class="ds-select">
                                <option v-for="opt in sidebarPositionOptions" :key="opt.value" :value="opt.value">
                                    {{ opt.label }}
                                </option>
                            </select>
                        </div>

                        <div class="ds-form-group">
                            <label class="ds-label">{{ t("TXT_CODE_395f147d") }}</label>
                            <p class="ds-desc">{{ t("TXT_CODE_b305236a") }}</p>
                            <input v-model="formData.pageTitle" class="ds-input"
                                :placeholder="t('TXT_CODE_4ea93630')" />
                        </div>

                        <div class="ds-form-group">
                            <label class="ds-label">{{ t("TXT_CODE_47b5a2f7") }}</label>
                            <p class="ds-desc">{{ t("TXT_CODE_cf95364f") }}</p>
                            <div class="ds-input-group">
                                <input v-model="formData.logoUrl" class="ds-input"
                                    :placeholder="t('TXT_CODE_4ea93630')" />
                                <button class="ds-btn ds-btn--default" @click="uploadLogo">
                                    <UploadOutlined /> {{ t("TXT_CODE_ae09d79d") }}
                                </button>
                            </div>
                        </div>

                        <div class="ds-form-group">
                            <label class="ds-label">{{ t("TXT_CODE_8ae0dc90") }}</label>
                            <p class="ds-desc">{{ t("TXT_CODE_434786c9") }}<br />{{ t("TXT_CODE_cf95364f") }}</p>
                            <div class="ds-input-group">
                                <input v-model="formData.bgUrl" class="ds-input"
                                    :placeholder="t('TXT_CODE_4ea93630')" />
                                <button class="ds-btn ds-btn--default" @click="uploadBackground">
                                    <UploadOutlined /> {{ t("TXT_CODE_ae09d79d") }}
                                </button>
                            </div>
                        </div>
                    </div>

                    <div v-show="activeTab === 'about'" class="ds-form">
                        <h2 class="ds-title">{{ t("TXT_CODE_3b4b656d") }}</h2>
                        <div class="ds-about-content">
                            <p>{{ $t("TXT_CODE_d0c670df") }}</p>
                            <p>{{ $t("TXT_CODE_e57bd50f") }}</p>
                            <pre class="ds-license">{{ ApacheLicense }}</pre>
                        </div>
                    </div>
                </div>

                <div class="ds-footer" v-if="activeTab !== 'about'">
                    <div class="ds-message" :class="{ 'ds-message--error': saveError }">
                        {{ saveError || saveMessage }}
                    </div>
                    <button class="ds-btn ds-btn--primary" :disabled="submitIsLoading" @click="handleSave">
                        <SaveOutlined /> {{ t("TXT_CODE_abfe9512") }}
                    </button>
                </div>
            </div>
        </template>
    </div>
</template>

<style lang="scss" scoped>
.desktop-settings {
    display: flex;
    height: 100%;
    background: transparent;
    border-radius: 0 0 8px 8px;
    overflow: hidden;
}

.ds-loading {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--desktop-window-text-muted);
    font-size: 14px;
}

.ds-sidebar {
    width: 200px;
    background: transparent;
    border-right: none;
    padding: 16px 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.ds-tab {
    padding: 10px 16px;
    margin: 0 12px;
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--desktop-window-text-secondary);
    cursor: pointer;
    transition: all 0.2s;
    font-size: 13px;
    border-radius: 8px;

    &:hover {
        background: var(--desktop-window-control-hover);
        color: var(--desktop-window-text);
    }

    &--active {
        background: var(--desktop-window-titlebar-bg);

        &:hover {
            background: var(--desktop-window-control-hover);
        }
    }

    &__icon {
        font-size: 16px;
    }
}

.ds-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.ds-content__scroll {
    flex: 1;
    overflow-y: auto;
    padding: 24px 32px;

    &::-webkit-scrollbar {
        width: 6px;
    }

    &::-webkit-scrollbar-track {
        background: transparent;
    }

    &::-webkit-scrollbar-thumb {
        background: var(--desktop-window-border);
        border-radius: 3px;
    }
}

.ds-form {
    max-width: 600px;
}

.ds-title {
    font-size: 18px;
    font-weight: 600;
    color: var(--desktop-window-text);
    margin: 0 0 24px 0;
}

.ds-form-group {
    margin-bottom: 20px;
}

.ds-label {
    display: block;
    font-size: 14px;
    font-weight: 500;
    color: var(--desktop-window-text);
    margin-bottom: 6px;
}

.ds-desc {
    font-size: 12px;
    color: var(--desktop-window-text-muted);
    margin: 0 0 8px 0;
    line-height: 1.5;
}

.ds-mb-4 {
    margin-bottom: 16px;
}

.ds-input,
.ds-select,
.ds-textarea {
    width: 100%;
    max-width: 400px;
    padding: 8px 12px;
    background: var(--desktop-window-titlebar-bg);
    border: 1px solid var(--desktop-window-border);
    border-radius: 6px;
    color: var(--desktop-window-text);
    font-size: 13px;
    outline: none;
    transition: border-color 0.2s;
    font-family: inherit;

    &::placeholder {
        color: var(--desktop-window-text-muted);
    }

    &:focus {
        border-color: var(--desktop-window-border);
    }
}

.ds-textarea {
    resize: vertical;
    min-height: 80px;
}

.ds-select {
    appearance: none;
    background-image: url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23FFFFFF%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E");
    background-repeat: no-repeat;
    background-position: right 12px top 50%;
    background-size: 10px auto;
    padding-right: 30px;

    option {
        background: var(--desktop-window-bg);
        color: var(--desktop-window-text);
    }
}

.ds-input-group {
    display: flex;
    gap: 8px;
    max-width: 400px;

    .ds-input {
        flex: 1;
        max-width: none;
    }
}

.ds-btn {
    padding: 8px 16px;
    border: none;
    border-radius: 6px;
    font-size: 13px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    transition: all 0.2s;
    color: var(--desktop-window-text);
    white-space: nowrap;

    &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    &--primary {
        background: var(--color-blue-5, #1677ff);
        color: #fff;

        &:hover:not(:disabled) {
            background: var(--color-blue-6, #4096ff);
        }
    }

    &--default {
        background: var(--desktop-window-titlebar-bg);
        border: 1px solid var(--desktop-window-border);

        &:hover:not(:disabled) {
            background: var(--desktop-window-control-hover);
        }
    }
}

.ds-footer {
    padding: 16px 32px;
    border-top: none;
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 16px;
    background: transparent;
}

.ds-message {
    font-size: 13px;
    color: var(--color-green-5, #52c41a);

    &--error {
        color: var(--color-red-5, #ff4d4f);
    }
}

.ds-about-content {
    color: var(--desktop-window-text-secondary);
    font-size: 13px;
    line-height: 1.6;

    p {
        margin: 0 0 12px 0;
    }
}

.ds-license {
    background: var(--desktop-window-titlebar-bg);
    padding: 16px;
    border-radius: 6px;
    border: 1px solid var(--desktop-window-border);
    font-family: "Cascadia Code", "Fira Code", monospace;
    font-size: 12px;
    white-space: pre-wrap;
    color: var(--desktop-window-text-muted);
    margin-top: 20px;
}
</style>
