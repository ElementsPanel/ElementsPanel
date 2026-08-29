<script setup lang="ts">
import { useSchedule } from "@/hooks/useSchedule";
import { t } from "@/lang/i18n";
import { padZero } from "@/tools/common";
import { getPanelFrontendScheduleActions } from "@/plugins";
import type { Schedule, ScheduleAction, ScheduleTaskForm } from "@/types";
import { ScheduleActionType, ScheduleCreateType, ScheduleType } from "@/types/const";
import {
    ClockCircleOutlined,
    DeleteOutlined,
    EditOutlined,
    LoadingOutlined,
    MinusCircleOutlined,
    PlusCircleOutlined
} from "@ant-design/icons-vue";
import { notification } from "ant-design-vue";
import dayjs from "dayjs";
import _ from "lodash";
import { computed, h, onMounted, onUnmounted, reactive, ref } from "vue";
import DesktopWindow from "./DesktopWindow.vue";

const getPopupContainer = (triggerNode: HTMLElement) => {
    return triggerNode.parentElement || document.body;
};

const props = defineProps<{
    instanceId: string;
    daemonId: string;
}>();

const emit = defineEmits<{
    (e: "close"): void;
}>();

const {
    getScheduleList,
    schedules,
    scheduleListLoading,
    deleteSchedule,
    createTaskTypeInterval,
    createTaskTypeCycle,
    createTaskTypeSpecify,
    calculateIntervalFromTime,
    calculateTimeFromCycle,
    parseTaskTime,
    createState
} = useSchedule(props.instanceId, props.daemonId);

const scheduleActionTypes = computed(() => {
    const types: Record<string, string> = { ...ScheduleActionType };
    for (const action of getPanelFrontendScheduleActions()) {
        if (action.condition && !action.condition()) continue;
        types[action.type] = typeof action.title === "function" ? action.title() : action.title;
    }
    return types;
});

const windowWidth = ref(window.innerWidth);
const windowHeight = ref(window.innerHeight);

const updateWindowSize = () => {
    windowWidth.value = window.innerWidth;
    windowHeight.value = window.innerHeight;
};

onMounted(() => {
    window.addEventListener("resize", updateWindowSize);
});

onUnmounted(() => {
    window.removeEventListener("resize", updateWindowSize);
});

const scheduleList = ref<Schedule[]>([]);

const loadSchedules = async () => {
    await getScheduleList();
    if (schedules.value) {
        scheduleList.value = schedules.value as unknown as Schedule[];
    }
};

const handleDelete = async (name: string) => {
    await deleteSchedule(name);
    await loadSchedules();
};

const timeRender = (text: string, schedule: Schedule) => {
    const formatFunctions = {
        [ScheduleCreateType.INTERVAL]: (t: string) => {
            const time = Number(t);
            const h = padZero(Math.floor(time / 3600).toString());
            const m = padZero(Math.floor((time % 3600) / 60).toString());
            const s = padZero((time % 60).toString());
            return `${h}:${m}:${s}`;
        },
        [ScheduleCreateType.CYCLE]: (time: string) => {
            const [s, m, h, , , w] = time.split(" ");
            return `${t("TXT_CODE_76750199")} ${w} / ${padZero(h)}:${padZero(m)}:${padZero(s)}`;
        },
        [ScheduleCreateType.SPECIFY]: (time: string) => {
            const [s, m, h, dd, mm] = time.split(" ");
            return `${mm}/${dd} ${padZero(h)}:${padZero(m)}:${padZero(s)}`;
        }
    };

    const formatFunction = formatFunctions[schedule.type as ScheduleCreateType];
    return formatFunction(text) ?? "Unknown Time";
};

const dialogOpen = ref(false);
const isEditing = ref(false);
const isLoading = ref(false);

const weeks = [
    { label: t("TXT_CODE_fcbdcb34"), value: 1 },
    { label: t("TXT_CODE_c73de59d"), value: 2 },
    { label: t("TXT_CODE_85617390"), value: 3 },
    { label: t("TXT_CODE_c9b31f8e"), value: 4 },
    { label: t("TXT_CODE_d4517dcb"), value: 5 },
    { label: t("TXT_CODE_d248b5c8"), value: 6 },
    { label: t("TXT_CODE_a621f370"), value: 7 }
];

const defaultAction: ScheduleAction = {
    type: "command",
    payload: ""
};

const defaultTask: ScheduleTaskForm = {
    name: "",
    count: 0,
    type: ScheduleCreateType.INTERVAL,
    time: "",
    actions: [_.clone(defaultAction)],
    weekend: [],
    cycle: ["0", "0", "0"],
    objTime: dayjs()
};

let formTask = reactive<ScheduleTaskForm>(_.cloneDeep(defaultTask));

const openNewDialog = () => {
    formTask = reactive(_.cloneDeep(defaultTask));
    isEditing.value = false;
    dialogOpen.value = true;
};

const openEditDialog = (task: Schedule) => {
    formTask = reactive({
        ..._.cloneDeep(defaultTask),
        ...task,
        count: Number(task?.count) === -1 ? "" : Number(task?.count)
    });

    isEditing.value = true;

    const parseTime = {
        [ScheduleCreateType.INTERVAL]: (time: string) =>
            (formTask.cycle = calculateIntervalFromTime(time)),
        [ScheduleCreateType.CYCLE]: (time: string) => {
            const { objTime, weekend } = calculateTimeFromCycle(time);
            formTask.objTime = objTime;
            formTask.weekend = weekend;
        },
        [ScheduleCreateType.SPECIFY]: (time: string) => (formTask.objTime = parseTaskTime(time))
    };
    parseTime[formTask.type](formTask.time);

    dialogOpen.value = true;
};

const getInputPlaceholder = (action: ScheduleAction) => {
    if (action.type === "delay") {
        return t("TXT_CODE_bb760145");
    }
    if (action.type === "command") {
        return t("TXT_CODE_8ff89011");
    }
    const pluginAction = getPanelFrontendScheduleActions().find((item) => item.type === action.type);
    if (!pluginAction?.inputPlaceholder) return;
    return typeof pluginAction.inputPlaceholder === "function"
        ? pluginAction.inputPlaceholder()
        : pluginAction.inputPlaceholder;
};

const addEmptyAction = () => {
    formTask.actions[formTask.actions.length] = _.clone(defaultAction);
};

const delAction = (index: number) => {
    if (formTask.actions.length === 1) return;
    formTask.actions.splice(index, 1);
};

const submitForm = async () => {
    try {
        isLoading.value = true;
        if (isEditing.value) await deleteSchedule(formTask.name, false);

        const create = {
            [ScheduleCreateType.INTERVAL]: (task: ScheduleTaskForm) => createTaskTypeInterval(task),
            [ScheduleCreateType.CYCLE]: (task: ScheduleTaskForm) => createTaskTypeCycle(task),
            [ScheduleCreateType.SPECIFY]: (task: ScheduleTaskForm) => createTaskTypeSpecify(task)
        };

        await create[formTask.type](formTask);

        if (createState.value) {
            notification.success({
                message: isEditing.value ? t("TXT_CODE_d3de39b4") : t("TXT_CODE_d28c05df")
            });
            dialogOpen.value = false;
            await loadSchedules();
        }
    } catch (err: any) {
        console.error(err);
    } finally {
        isLoading.value = false;
    }
};

onMounted(async () => {
    await loadSchedules();
});
</script>

<template>
    <div class="dschedule">
        <div class="dschedule-header">
            <div class="dschedule-header__right">
                <button class="ds-btn ds-btn--primary" @click="openNewDialog">
                    <PlusCircleOutlined />
                    {{ t("TXT_CODE_1644b775") }}
                </button>
                <button class="ds-btn" @click="loadSchedules">
                    {{ t("TXT_CODE_b76d94e0") }}
                </button>
            </div>
        </div>

        <div class="dschedule-body">
            <a-spin :spinning="scheduleListLoading">
                <div v-if="scheduleList.length === 0 && !scheduleListLoading" class="dschedule-empty">
                    {{ t("TXT_CODE_NO_DATA") }}
                </div>
                <div v-for="item in scheduleList" :key="item.name" class="dschedule-item">
                    <div class="dschedule-item__info">
                        <div class="dschedule-item__name">{{ item.name }}</div>
                        <div class="dschedule-item__meta">
                            <span v-if="item.actions && item.actions.length" class="dschedule-item__tag ds-tag--action">
                                {{ scheduleActionTypes[item.actions[0].type] ?? item.actions[0].type }}
                            </span>
                            <span class="dschedule-item__tag ds-tag--type">
                                {{ ScheduleType[item.type as keyof typeof ScheduleType] }}
                            </span>
                            <span class="dschedule-item__time">
                                {{ timeRender(item.time, item) }}
                            </span>
                            <span v-if="Number(item.count) > 0" class="dschedule-item__count">
                                x{{ item.count }}
                            </span>
                            <span v-else class="dschedule-item__count ds-count--unlimited">
                                {{ t("TXT_CODE_a92df201") }}
                            </span>
                        </div>
                        <div v-if="item.actions && item.actions[0]?.payload" class="dschedule-item__payload">
                            {{ item.actions[0].payload }}
                        </div>
                    </div>
                    <div class="dschedule-item__actions">
                        <button class="ds-btn-icon" :title="t('TXT_CODE_ad207008')" @click="openEditDialog(item)">
                            <EditOutlined />
                        </button>
                        <button class="ds-btn-icon ds-btn-icon--danger" :title="t('TXT_CODE_ecbd7449')"
                            @click="handleDelete(item.name)">
                            <DeleteOutlined />
                        </button>
                    </div>
                </div>
            </a-spin>
        </div>
    </div>

    <Teleport to="body">
        <Transition name="ds-dialog-fade">
            <DesktopWindow v-if="dialogOpen" id="schedule-task-dialog"
                :title="isEditing ? t('TXT_CODE_1548649e') : t('TXT_CODE_3502273d')" :icon="ClockCircleOutlined"
                :visible="dialogOpen" :minimized="false" :maximized="false" :active="true" :initial-width="700"
                :initial-height="520" :initial-x="windowWidth / 2 - 350" :initial-y="windowHeight / 2 - 260"
                :z-index="10004" :show-minimize="false" :show-maximize="false" :resizable="false"
                @close="dialogOpen = false">
                <div class="ds-dialog-content">
                    <a-form layout="vertical" class="ds-dialog-form">
                        <a-form-item :label="t('TXT_CODE_b290a4b0')">
                            <a-input v-model:value="formTask.name" :disabled="isEditing"
                                :placeholder="t('TXT_CODE_b72d638d')" />
                        </a-form-item>

                        <a-form-item :label="t('TXT_CODE_a62c99d1')">
                            <a-select v-model:value="formTask.type" :placeholder="t('TXT_CODE_3bb646e4')"
                                :getPopupContainer="getPopupContainer">
                                <a-select-option v-for="(type, i) in ScheduleType" :key="i" :value="Number(i)">
                                    {{ type }}
                                </a-select-option>
                            </a-select>
                        </a-form-item>

                        <template v-if="formTask.type === ScheduleCreateType.INTERVAL">
                            <a-form-item :label="t('TXT_CODE_3554dac0')">
                                <a-row :gutter="[12, 12]">
                                    <a-col :span="8">
                                        <a-input v-model:value="formTask.cycle[2]" :placeholder="t('TXT_CODE_ba8ebc7')"
                                            :addon-after="t('TXT_CODE_4e2c7f64')" />
                                    </a-col>
                                    <a-col :span="8">
                                        <a-input v-model:value="formTask.cycle[1]" :placeholder="t('TXT_CODE_ba8ebc7')"
                                            :addon-after="t('TXT_CODE_a7e9ff0f')" />
                                    </a-col>
                                    <a-col :span="8">
                                        <a-input v-model:value="formTask.cycle[0]" :placeholder="t('TXT_CODE_ba8ebc7')"
                                            :addon-after="t('TXT_CODE_acabc771')" />
                                    </a-col>
                                </a-row>
                            </a-form-item>
                            <a-form-item :label="t('TXT_CODE_d9cfab1b')">
                                <a-input-number v-model:value="formTask.count" class="w-100"
                                    :placeholder="t('TXT_CODE_a59981f4')" />
                            </a-form-item>
                        </template>

                        <template v-if="formTask.type === ScheduleCreateType.CYCLE">
                            <a-form-item :label="t('TXT_CODE_3554dac0')">
                                <a-time-picker v-model:value="formTask.objTime" class="w-100"
                                    :getPopupContainer="getPopupContainer" />
                            </a-form-item>
                            <a-form-item :label="t('TXT_CODE_76750199')">
                                <a-checkbox-group v-model:value="formTask.weekend" :options="weeks" />
                            </a-form-item>
                            <a-form-item :label="t('TXT_CODE_d9cfab1b')">
                                <a-input-number v-model:value="formTask.count" class="w-100"
                                    :placeholder="t('TXT_CODE_a59981f4')" />
                            </a-form-item>
                        </template>

                        <template v-if="formTask.type === ScheduleCreateType.SPECIFY">
                            <a-form-item :label="t('TXT_CODE_f3fe5c8e')">
                                <a-date-picker v-model:value="formTask.objTime" show-time class="w-100"
                                    :getPopupContainer="getPopupContainer" />
                            </a-form-item>
                        </template>

                        <a-form-item>
                            <div class="ds-actions-header">
                                <span>{{ t("TXT_CODE_61811ac") }}</span>
                                <a-button size="small" :icon="h(PlusCircleOutlined)" @click="addEmptyAction">
                                    {{ t("TXT_CODE_dfc17a0c") }}
                                </a-button>
                            </div>
                            <div v-for="(action, index) in formTask.actions" :key="index" class="ds-action-row">
                                <a-row :gutter="[8, 8]">
                                    <a-col :span="6">
                                        <a-select v-model:value="action.type" @change="action.payload = ''"
                                            :getPopupContainer="getPopupContainer">
                                            <a-select-option v-for="(type, i) in scheduleActionTypes" :key="i"
                                                :value="i">
                                                {{ type }}
                                            </a-select-option>
                                        </a-select>
                                    </a-col>
                                    <a-col :span="16">
                                        <a-input v-model:value="action.payload"
                                            :placeholder="getInputPlaceholder(action) || t('TXT_CODE_6cbb84a9')"
                                            :disabled="!getInputPlaceholder(action)" />
                                    </a-col>
                                    <a-col :span="2">
                                        <a-button :icon="h(MinusCircleOutlined)" danger @click="delAction(index)" />
                                    </a-col>
                                </a-row>
                            </div>
                        </a-form-item>
                    </a-form>
                    <div class="ds-dialog-footer">
                        <button class="ds-dialog-btn ds-dialog-btn--default" @click="dialogOpen = false">
                            {{ t("TXT_CODE_a0451c97") }}
                        </button>
                        <button class="ds-dialog-btn ds-dialog-btn--primary" :disabled="isLoading" @click="submitForm">
                            <LoadingOutlined v-if="isLoading" />
                            {{ t("TXT_CODE_abfe9512") }}
                        </button>
                    </div>
                </div>
            </DesktopWindow>
        </Transition>
    </Teleport>
</template>

<style lang="scss" scoped>
.dschedule {
    height: 100%;
    display: flex;
    flex-direction: column;
    color: var(--desktop-window-text);
    font-size: 13px;
    overflow: hidden;
}

.dschedule-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    border-bottom: 1px solid var(--desktop-window-border);
    flex-shrink: 0;

    &__left {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 13px;
        font-weight: 500;
    }

    &__right {
        display: flex;
        align-items: center;
        gap: 6px;
    }
}

.ds-btn {
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

    &:hover {
        background: var(--desktop-window-control-hover);
    }

    &--primary {
        color: #52c41a;
        border-color: rgba(82, 196, 26, 0.3);
        background: rgba(82, 196, 26, 0.1);

        &:hover {
            background: rgba(82, 196, 26, 0.2);
        }
    }
}

.ds-btn-icon {
    background: transparent;
    border: none;
    color: var(--desktop-window-text-muted);
    padding: 4px 6px;
    cursor: pointer;
    border-radius: 4px;
    transition: all 0.2s;
    font-size: 14px;

    &:hover {
        background: var(--desktop-window-control-hover);
        color: var(--desktop-window-text);
    }

    &--danger:hover {
        color: #ff4d4f;
        background: rgba(255, 77, 79, 0.1);
    }
}

.dschedule-body {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
}

.dschedule-empty {
    text-align: center;
    padding: 40px 16px;
    color: var(--desktop-window-text-muted);
    font-size: 13px;
}

.dschedule-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    border-radius: 8px;
    transition: background 0.2s;
    gap: 12px;

    &:hover {
        background: var(--desktop-window-control-hover);
    }

    &__info {
        flex: 1;
        min-width: 0;
    }

    &__name {
        font-size: 13px;
        font-weight: 500;
        color: var(--desktop-window-text);
        margin-bottom: 4px;
    }

    &__meta {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
    }

    &__tag {
        font-size: 11px;
        padding: 1px 6px;
        border-radius: 4px;
    }

    &__time {
        font-size: 11px;
        color: var(--desktop-window-text-muted);
    }

    &__count {
        font-size: 11px;
        color: var(--desktop-window-text-muted);
    }

    &__payload {
        font-size: 11px;
        color: var(--desktop-window-text-muted);
        margin-top: 2px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    &__actions {
        display: flex;
        align-items: center;
        gap: 2px;
        flex-shrink: 0;
    }
}

.ds-tag--action {
    background: rgba(82, 196, 26, 0.1);
    color: #52c41a;
}

.ds-tag--type {
    background: rgba(22, 119, 255, 0.1);
    color: #1677ff;
}

.ds-count--unlimited {
    color: var(--desktop-window-text-muted);
}

.ds-actions-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
    font-weight: 500;
}

.ds-action-row {
    margin-bottom: 8px;
}

.w-100 {
    width: 100%;
}

.ds-dialog-fade-enter-active,
.ds-dialog-fade-leave-active {
    transition: all 0.25s cubic-bezier(0.25, 0.10, 0.25, 1.00);
}

.ds-dialog-fade-enter-from,
.ds-dialog-fade-leave-to {
    opacity: 0;
    transform: scale(0.95);
}

.ds-dialog-content {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: transparent;
    padding: 16px 20px 0;
}

.ds-dialog-form {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding-bottom: 12px;
}

.ds-dialog-footer {
    padding: 12px 0;
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    border-top: 1px solid var(--desktop-window-border);
    flex-shrink: 0;
}

.ds-dialog-btn {
    padding: 7px 16px;
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
        border-color: var(--color-blue-5, #1677ff);

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
</style>
