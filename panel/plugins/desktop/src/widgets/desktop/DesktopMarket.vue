<script setup lang="ts">
import { openNodeSelectDialog } from "@/components/fc";
import { SEARCH_ALL_KEY, useMarketPackages } from "@/hooks/useMarketPackages";
import { t } from "@/lang/i18n";
import { getDockerHubImagePlatforms } from "@/services/apis/envImage";
import { createAsyncTask } from "@/services/apis/instance";
import { reportErrorMsg } from "@/tools/validator";
import type { QuickStartPackages } from "@/types";
import {
    ArrowLeftOutlined,
    CloudDownloadOutlined,
    CodeOutlined,
    CloudDownloadOutlined as InstallIcon,
    SearchOutlined
} from "@ant-design/icons-vue";
import { computed, onMounted, ref } from "vue";
import DesktopWindow from "./DesktopWindow.vue";

const emit = defineEmits<{
    "open-console": [instance: any, daemonId: string];
}>();

const {
    searchForm,
    appListLoading,
    filteredList: appList,
    platformOptions,
    fetchTemplate
} = useMarketPackages();

const isCategoryView = computed(() => searchForm.gameType === SEARCH_ALL_KEY);
const detailList = computed(() => (isCategoryView.value ? [] : appList.value));

const handleBackToCategory = () => {
    searchForm.gameType = SEARCH_ALL_KEY;
    searchForm.platform = SEARCH_ALL_KEY;
    searchForm.keyword = "";
};

const onCategoryCardClick = (item: QuickStartPackages) => {
    searchForm.gameType = item.gameType;
    searchForm.platform = SEARCH_ALL_KEY;
};

onMounted(() => {
    fetchTemplate();
});

const showInstallDialog = ref(false);
const selectedTemplate = ref<QuickStartPackages | null>(null);
const selectedTemplateType = ref<"normal" | "docker">("normal");
const instanceName = ref("");
const isInstalling = ref(false);

const windowWidth = ref(window.innerWidth);
const windowHeight = ref(window.innerHeight);

onMounted(() => {
    const updateWindowSize = () => {
        windowWidth.value = window.innerWidth;
        windowHeight.value = window.innerHeight;
    };
    window.addEventListener('resize', updateWindowSize);
});

const { execute: executeCreateAsyncTask } = createAsyncTask();

const openInstallDialog = (item: QuickStartPackages, type: "normal" | "docker") => {
    selectedTemplate.value = item;
    selectedTemplateType.value = type;
    instanceName.value = "";
    showInstallDialog.value = true;
};

const closeInstallDialog = () => {
    showInstallDialog.value = false;
    selectedTemplate.value = null;
    instanceName.value = "";
};

const getImagePlatformsFromDockerHub = async (imageName: string): Promise<string[]> => {
    try {
        const { execute } = getDockerHubImagePlatforms();
        const state = await execute({
            data: { imageName }
        });
        if (Array.isArray(state.value)) {
            return state.value;
        }
        return [];
    } catch (error: any) {
        console.warn("Failed to get image platforms from Docker Hub:", error);
        return [];
    }
};

const handleInstall = async () => {
    if (!instanceName.value.trim()) {
        return reportErrorMsg(t("TXT_CODE_cf27ab7e"));
    }
    if (!selectedTemplate.value) return;

    isInstalling.value = true;
    try {
        const template = selectedTemplate.value;
        const setupInfo: any = {
            ...template.setupInfo,
            docker: {
                ...template.setupInfo.docker
            }
        };

        if (selectedTemplateType.value === "docker") {
            setupInfo.docker = {
                ...setupInfo.docker,
                ...template.dockerOptional
            };
            setupInfo.processType = "docker";
        }

        let targetPlatforms: string[] | undefined;
        if (setupInfo?.docker?.image) {
            targetPlatforms = await getImagePlatformsFromDockerHub(setupInfo.docker.image);
            if (!targetPlatforms || targetPlatforms.length === 0) {
                targetPlatforms = undefined;
            }
        }

        const node = await openNodeSelectDialog(targetPlatforms);
        if (!node) {
            isInstalling.value = false;
            return;
        }

        const res = await executeCreateAsyncTask({
            params: {
                daemonId: node.uuid,
                uuid: "-",
                task_name: "quick_install"
            },
            data: {
                time: Date.now(),
                newInstanceName: instanceName.value.trim(),
                targetLink: template.targetLink || "",
                setupInfo
            }
        });

        closeInstallDialog();

        if (res.value?.instanceUuid) {
            emit("open-console", { instanceUuid: res.value.instanceUuid, config: { nickname: instanceName.value.trim() } }, node.uuid);
        }
    } catch (err: any) {
        console.error(err);
        reportErrorMsg(err.message);
    } finally {
        isInstalling.value = false;
    }
};
</script>

<template>
    <div class="desktop-market">
        <div v-if="appListLoading" class="dm-loading">
            {{ t("TXT_CODE_b197be11") }}
        </div>
        <template v-else>
            <div class="dm-header">
                <div class="dm-header__left">
                    <button v-if="!isCategoryView" class="dm-btn dm-btn--icon" @click="handleBackToCategory">
                        <ArrowLeftOutlined />
                    </button>
                    <h2 class="dm-title">
                        {{ isCategoryView ? t("TXT_CODE_88249aee") : searchForm.gameType }}
                    </h2>
                </div>
                <div class="dm-header__right" v-if="!isCategoryView">
                    <select v-model="searchForm.platform" class="dm-select">
                        <option v-for="opt in platformOptions" :key="opt.value" :value="opt.value">
                            {{ opt.label }}
                        </option>
                    </select>
                    <div class="dm-search">
                        <SearchOutlined class="dm-search__icon" />
                        <input v-model="searchForm.keyword" class="dm-search__input"
                            :placeholder="t('TXT_CODE_ce132192')" />
                    </div>
                </div>
            </div>

            <div class="dm-content">
                <div v-if="isCategoryView" class="dm-grid">
                    <div v-for="item in appList" :key="item.key" class="dm-card" @click="onCategoryCardClick(item)">
                        <div class="dm-card__image-wrapper">
                            <img :src="item.image" :alt="item.title" class="dm-card__image" />
                        </div>
                        <div class="dm-card__info">
                            <h3 class="dm-card__title">{{ item.title }}</h3>
                        </div>
                    </div>
                </div>

                <div v-else class="dm-list">
                    <div v-if="detailList.length === 0" class="dm-empty">
                        {{ t("TXT_CODE_7356e569") }}
                    </div>
                    <div v-for="item in detailList" :key="item.key" class="dm-list-item">
                        <div class="dm-list-item__left">
                            <h3 class="dm-list-item__title">{{ item.title }}</h3>
                            <p class="dm-list-item__desc">{{ item.description }}</p>
                            <div class="dm-list-item__meta">
                                <span class="dm-tag">{{ item.platform }}</span>
                                <span class="dm-tag">{{ item.category }}</span>
                                <span class="dm-tag" v-if="item.author">@{{ item.author }}</span>
                            </div>
                        </div>
                        <div class="dm-list-item__right">
                            <button class="dm-btn dm-btn--primary" @click="openInstallDialog(item, 'normal')">
                                <CloudDownloadOutlined /> {{ t("TXT_CODE_1704ea49") }}
                            </button>
                            <button v-if="item.dockerOptional" class="dm-btn dm-btn--docker"
                                @click="openInstallDialog(item, 'docker')">
                                <CodeOutlined /> Docker
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </template>

        <Teleport to="body">
            <Transition name="du-dialog-fade">
                <DesktopWindow v-if="showInstallDialog" id="market-install-dialog" :title="t('TXT_CODE_c10ea805')"
                    :icon="InstallIcon" :visible="showInstallDialog" :minimized="false" :maximized="false"
                    :active="true" :initial-width="480" :initial-height="400" :initial-x="windowWidth / 2 - 240"
                    :initial-y="windowHeight / 2 - 200" :z-index="10001" :show-minimize="false" :show-maximize="false"
                    :resizable="false" @close="closeInstallDialog">
                    <div class="dm-install-content">
                        <div class="dm-install-body">
                            <div v-if="selectedTemplate" class="dm-template-info">
                                <img v-if="selectedTemplate.image" :src="selectedTemplate.image"
                                    class="dm-template-info__img" />
                                <div class="dm-template-info__text">
                                    <h4>{{ selectedTemplate.title }}</h4>
                                    <p>{{ selectedTemplate.description }}</p>
                                    <div class="dm-template-info__tags">
                                        <span class="dm-tag">{{ selectedTemplate.platform }}</span>
                                        <span class="dm-tag">{{ selectedTemplateType === 'docker' ? 'Docker' : 'Normal'
                                        }}</span>
                                    </div>
                                </div>
                            </div>
                            <div class="dm-form-group">
                                <label>{{ t("TXT_CODE_44ae0e7") }}</label>
                                <input v-model="instanceName" class="dm-input" :placeholder="t('TXT_CODE_cf27ab7e')"
                                    maxlength="50" />
                            </div>
                        </div>
                        <div class="dm-install-footer">
                            <button class="dm-btn dm-btn--default" @click="closeInstallDialog" :disabled="isInstalling">
                                {{ t("TXT_CODE_a0451c97") }}
                            </button>
                            <button class="dm-btn dm-btn--primary" @click="handleInstall" :disabled="isInstalling">
                                {{ isInstalling ? t("TXT_CODE_b197be11") : t("TXT_CODE_e4898801") }}
                            </button>
                        </div>
                    </div>
                </DesktopWindow>
            </Transition>
        </Teleport>
    </div>
</template>

<style lang="scss" scoped>
.desktop-market {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: transparent;
    border-radius: 0 0 8px 8px;
    overflow: hidden;
    position: relative;
}

.dm-loading {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--desktop-window-text-muted);
    font-size: 14px;
}

.dm-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px 24px;
    border-bottom: 1px solid var(--desktop-window-border);
    background: var(--desktop-window-titlebar-bg);

    &__left {
        display: flex;
        align-items: center;
        gap: 16px;
    }

    &__right {
        display: flex;
        align-items: center;
        gap: 12px;
    }
}

.dm-title {
    font-size: 18px;
    font-weight: 600;
    color: var(--desktop-window-text);
    margin: 0;
}

.dm-content {
    flex: 1;
    overflow-y: auto;
    padding: 24px;

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

.dm-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 20px;
}

.dm-card {
    background: var(--desktop-window-titlebar-bg);
    border: 1px solid var(--desktop-window-border);
    border-radius: 8px;
    overflow: hidden;
    cursor: pointer;
    transition: all 0.2s;

    &:hover {
        background: var(--desktop-window-control-hover);
        border-color: var(--desktop-window-border);
    }

    &__image-wrapper {
        height: 140px;
        overflow: hidden;
        background: var(--desktop-window-titlebar-bg);
    }

    &__image {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }

    &__info {
        padding: 16px;
    }

    &__title {
        margin: 0;
        font-size: 15px;
        font-weight: 500;
        color: var(--desktop-window-text);
        text-align: center;
    }
}

.dm-list {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.dm-empty {
    text-align: center;
    padding: 40px;
    color: var(--desktop-window-text-muted);
    font-size: 14px;
}

.dm-list-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px;
    background: var(--desktop-window-titlebar-bg);
    border: 1px solid var(--desktop-window-border);
    border-radius: 8px;
    transition: all 0.2s;

    &:hover {
        background: var(--desktop-window-control-hover);
        border-color: var(--desktop-window-border);
    }

    &__left {
        flex: 1;
        padding-right: 24px;
    }

    &__title {
        margin: 0 0 8px 0;
        font-size: 16px;
        font-weight: 600;
        color: var(--desktop-window-text);
    }

    &__desc {
        margin: 0 0 12px 0;
        font-size: 13px;
        color: var(--desktop-window-text-secondary);
        line-height: 1.5;
    }

    &__meta {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
    }

    &__right {
        display: flex;
        flex-direction: column;
        gap: 8px;
        min-width: 120px;
    }
}

.dm-tag {
    padding: 2px 8px;
    background: var(--desktop-window-titlebar-bg);
    border: 1px solid var(--desktop-window-border);
    border-radius: 4px;
    font-size: 12px;
    color: var(--desktop-window-text-secondary);
}

.dm-select {
    appearance: none;
    background-color: var(--desktop-window-titlebar-bg);
    border: 1px solid var(--desktop-window-border);
    border-radius: 6px;
    color: var(--desktop-window-text);
    padding: 6px 30px 6px 12px;
    font-size: 13px;
    outline: none;
    cursor: pointer;
    background-image: url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23FFFFFF%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E");
    background-repeat: no-repeat;
    background-position: right 10px top 50%;
    background-size: 10px auto;

    option {
        background: var(--desktop-window-bg);
        color: var(--desktop-window-text);
    }
}

.dm-search {
    display: flex;
    align-items: center;
    background: var(--desktop-window-titlebar-bg);
    border: 1px solid var(--desktop-window-border);
    border-radius: 6px;
    padding: 0 12px;
    width: 200px;

    &__icon {
        color: var(--desktop-window-text-muted);
        font-size: 14px;
    }

    &__input {
        flex: 1;
        background: transparent;
        border: none;
        color: var(--desktop-window-text);
        padding: 6px 8px;
        font-size: 13px;
        outline: none;

        &::placeholder {
            color: var(--desktop-window-text-muted);
        }
    }
}

.dm-btn {
    padding: 8px 16px;
    border: none;
    border-radius: 6px;
    font-size: 13px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    transition: all 0.2s;
    color: var(--desktop-window-text);

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

    &--docker {
        background: #0db7ed;
        color: #fff;

        &:hover:not(:disabled) {
            background: #1ac6fc;
        }
    }

    &--default {
        background: var(--desktop-window-titlebar-bg);
        border: 1px solid var(--desktop-window-border);

        &:hover:not(:disabled) {
            background: var(--desktop-window-control-hover);
        }
    }

    &--icon {
        padding: 8px;
        background: transparent;
        font-size: 16px;
        color: var(--desktop-window-text-secondary);

        &:hover:not(:disabled) {
            background: var(--desktop-window-control-hover);
            color: var(--desktop-window-text);
        }
    }
}

.dm-install-content {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: transparent;
}

.dm-install-body {
    flex: 1;
    padding: 24px;
    overflow-y: auto;
}

.dm-install-footer {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    padding: 16px 24px;
    border-top: 1px solid var(--desktop-window-border);
    background: var(--desktop-window-titlebar-bg);
}

.dm-template-info {
    display: flex;
    gap: 16px;
    margin-bottom: 24px;
    padding: 16px;
    background: var(--desktop-window-titlebar-bg);
    border-radius: 8px;
    border: 1px solid var(--desktop-window-border);

    &__img {
        width: 64px;
        height: 64px;
        border-radius: 6px;
        object-fit: cover;
    }

    &__text {
        flex: 1;

        h4 {
            margin: 0 0 8px 0;
            font-size: 15px;
            color: var(--desktop-window-text);
        }

        p {
            margin: 0 0 12px 0;
            font-size: 13px;
            color: var(--desktop-window-text-secondary);
            line-height: 1.4;
        }
    }

    &__tags {
        display: flex;
        gap: 8px;
    }
}

.dm-form-group {
    label {
        display: block;
        margin-bottom: 8px;
        font-size: 13px;
        color: var(--desktop-window-text);
    }
}

.dm-input {
    width: 100%;
    padding: 10px 12px;
    background: var(--desktop-window-titlebar-bg);
    border: 1px solid var(--desktop-window-border);
    border-radius: 6px;
    color: var(--desktop-window-text);
    font-size: 14px;
    outline: none;
    transition: border-color 0.2s;
    box-sizing: border-box;

    &:focus {
        border-color: var(--color-blue-5, #1677ff);
    }

    &::placeholder {
        color: var(--desktop-window-text-muted);
    }
}

.du-dialog-fade-enter-active,
.du-dialog-fade-leave-active {
    transition: all 0.25s cubic-bezier(0.25, 0.10, 0.25, 1.00);
}

.du-dialog-fade-enter-from,
.du-dialog-fade-leave-to {
    opacity: 0;
    transform: scale(0.95);
}
</style>
