<script setup lang="ts">
import Empty from "@elementspanel/epanel-plugin-console/components/Empty";
import DesktopDialog from "@elementspanel/epanel-plugin-console/components/DesktopDialog";
import { useSchedule } from "@elementspanel/epanel-plugin-console/hooks/useSchedule";
import { t } from "@elementspanel/epanel-plugin-i18n";
import { padZero } from "@elementspanel/epanel-plugin-console/tools/common";
import { ctx } from "@elements-panel/sdk";
import type {
  Schedule,
  ScheduleAction,
  ScheduleTaskForm
} from "@elementspanel/epanel-plugin-console/types";
import {
  ScheduleActionType,
  ScheduleCreateType,
  ScheduleType
} from "@elementspanel/epanel-plugin-console/types/const";
import { notifyDesktop } from "@elementspanel/epanel-plugin-console/tools/desktopNotice";
import dayjs from "dayjs";
import _ from "lodash";
import { computed, onMounted, reactive, ref } from "vue";
import { VBtn, VCheckbox, VIcon, VSelect, VTextField } from "vuetify/components";

const ClockCircleOutlined = "mdi-clock-outline";
const MinusCircleOutlined = "mdi-minus-circle-outline";

const props = defineProps<{
  instanceId: string;
  daemonId: string;
}>();

defineEmits<{
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
  for (const action of ctx.actions.schedules) {
    if (action.condition && !action.condition()) continue;
    types[action.type] = typeof action.title === "function" ? action.title() : action.title;
  }
  return types;
});

const scheduleTypeItems = computed(() =>
  Object.entries(ScheduleType).map(([value, title]) => ({
    title,
    value: Number(value)
  }))
);
const actionTypeItems = computed(() =>
  Object.entries(scheduleActionTypes.value).map(([value, title]) => ({
    title,
    value
  }))
);

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
      return `${t("TXT_CODE_COMMON_EVERY_WEEK")} ${w} / ${padZero(h)}:${padZero(m)}:${padZero(s)}`;
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
  { label: t("TXT_CODE_COMMON_MONDAY"), value: 1 },
  { label: t("TXT_CODE_COMMON_TUESDAY"), value: 2 },
  { label: t("TXT_CODE_COMMON_WEDNESDAY"), value: 3 },
  { label: t("TXT_CODE_COMMON_THURSDAY"), value: 4 },
  { label: t("TXT_CODE_COMMON_FRIDAY"), value: 5 },
  { label: t("TXT_CODE_COMMON_SATURDAY"), value: 6 },
  { label: t("TXT_CODE_COMMON_SUNDAY"), value: 7 }
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
    return t("TXT_CODE_COMMON_PLEASE_ENTER_A_TIME_IN_MILLISECONDS_FYI_1000MS_1S");
  }
  if (action.type === "command") {
    return t(
      "TXT_CODE_COMMON_PLEASE_ENTER_THE_COMMAND_TO_SEND_TO_THE_INSTANCE_TO_SHUT_IT_DOWN_EXAMPLE_MESSAGES_INCLUDE"
    );
  }
  const pluginAction = ctx.actions.schedules.find((item) => item.type === action.type);
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
      notifyDesktop(
        isEditing.value
          ? t("TXT_CODE_COMMON_UPDATE_SUCCESSFUL")
          : t("TXT_CODE_COMMON_CREATE_SUCCESS"),
        "success"
      );
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
        <VBtn class="ds-btn ds-btn--primary" variant="text" @click="openNewDialog">
          <VIcon icon="mdi-plus-circle-outline" />
          {{ t("TXT_CODE_COMMON_NEW_TASK") }}
        </VBtn>
        <VBtn class="ds-btn" variant="text" @click="loadSchedules">
          {{ t("TXT_CODE_COMMON_REFRESH") }}
        </VBtn>
      </div>
    </div>

    <div class="dschedule-body">
      <div class="dschedule-list" :class="{ 'dschedule-list--loading': scheduleListLoading }">
        <Empty v-if="scheduleList.length === 0 && !scheduleListLoading" icon="mdi-clock-outline" />
        <div v-for="item in scheduleList" :key="item.name" class="dschedule-item">
          <div class="dschedule-item__info">
            <div class="dschedule-item__name">{{ item.name }}</div>
            <div class="dschedule-item__meta">
              <span
                v-if="item.actions && item.actions.length"
                class="dschedule-item__tag ds-tag--action"
              >
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
                {{ t("TXT_CODE_SCHEDULE_REPEAT_FOREVER") }}
              </span>
            </div>
            <div v-if="item.actions && item.actions[0]?.payload" class="dschedule-item__payload">
              {{ item.actions[0].payload }}
            </div>
          </div>
          <div class="dschedule-item__actions">
            <VBtn
              icon
              variant="text"
              class="ds-btn-icon"
              :title="t('TXT_CODE_COMMON_EDIT')"
              @click="openEditDialog(item)"
            >
              <VIcon icon="mdi-pencil-outline" />
            </VBtn>
            <VBtn
              icon
              variant="text"
              class="ds-btn-icon ds-btn-icon--danger"
              :title="t('TXT_CODE_COMMON_DELETE')"
              @click="handleDelete(item.name)"
            >
              <VIcon icon="mdi-delete-outline" />
            </VBtn>
          </div>
        </div>
      </div>
    </div>
  </div>

  <DesktopDialog
    id="schedule-task-dialog"
    :title="
      isEditing
        ? t('TXT_CODE_COMMON_EDIT_SCHEDULED_TASKS')
        : t('TXT_CODE_COMMON_ADD_SCHEDULED_TASK')
    "
    :icon="ClockCircleOutlined"
    :model-value="dialogOpen"
    :width="700"
    :height="520"
    :z-index="10004"
    @close="dialogOpen = false"
  >
    <label class="ds-form-label">{{ t("TXT_CODE_SCHEDULE_NEW_TASK_NAME") }}</label>
    <VTextField
      v-model="formTask.name"
      :disabled="isEditing"
      density="compact"
      hide-details
      :placeholder="t('TXT_CODE_COMMON_REQUIRED_AND_MUST_BE_UNIQUE')"
    />

    <label class="ds-form-label">{{ t("TXT_CODE_COMMON_TASK_TYPE") }}</label>
    <VSelect
      v-model="formTask.type"
      :items="scheduleTypeItems"
      density="compact"
      hide-details
      :placeholder="t('TXT_CODE_COMMON_PLEASE_SELECT')"
    >
      <template #no-data><Empty :icon="false" compact /></template>
    </VSelect>

    <template v-if="formTask.type === ScheduleCreateType.INTERVAL">
      <label class="ds-form-label">{{ t("TXT_CODE_COMMON_TRIGGER_TIME") }}</label>
      <div class="ds-cycle-grid">
        <VTextField
          v-model="formTask.cycle[2]"
          :label="t('TXT_CODE_TIME_HOUR_UNIT')"
          density="compact"
          hide-details
        />
        <VTextField
          v-model="formTask.cycle[1]"
          :label="t('TXT_CODE_TIME_MINUTE_UNIT')"
          density="compact"
          hide-details
        />
        <VTextField
          v-model="formTask.cycle[0]"
          :label="t('TXT_CODE_COMMON_SEC')"
          density="compact"
          hide-details
        />
      </div>
      <label class="ds-form-label">{{ t("TXT_CODE_COMMON_EXECUTION_COUNT") }}</label>
      <VTextField
        v-model.number="formTask.count"
        type="number"
        density="compact"
        hide-details
        :placeholder="t('TXT_CODE_COMMON_LEAVE_BLANK_FOR_UNLIMITED')"
      />
    </template>

    <template v-if="formTask.type === ScheduleCreateType.CYCLE">
      <div class="ds-form-group">
        <label class="ds-form-label">{{ t("TXT_CODE_COMMON_TRIGGER_TIME") }}</label>
        <VTextField
          :model-value="formTask.objTime?.format('HH:mm:ss')"
          type="time"
          density="compact"
          hide-details
          @update:model-value="(value) => (formTask.objTime = dayjs(value, 'HH:mm:ss'))"
        />
      </div>
      <label class="ds-form-label">{{ t("TXT_CODE_COMMON_EVERY_WEEK") }}</label>
      <div class="ds-week-grid">
        <VCheckbox
          v-for="week in weeks"
          :key="week.value"
          v-model="formTask.weekend"
          :value="week.value"
          :label="week.label"
          hide-details
          density="compact"
        />
      </div>
      <label class="ds-form-label">{{ t("TXT_CODE_COMMON_EXECUTION_COUNT") }}</label>
      <VTextField
        v-model.number="formTask.count"
        type="number"
        density="compact"
        hide-details
        :placeholder="t('TXT_CODE_COMMON_LEAVE_BLANK_FOR_UNLIMITED')"
      />
    </template>

    <template v-if="formTask.type === ScheduleCreateType.SPECIFY">
      <div class="ds-form-group">
        <label class="ds-form-label">{{
          t("TXT_CODE_COMMON_PLEASE_SELECT_A_DATE_AND_TIME")
        }}</label>
        <VTextField
          :model-value="formTask.objTime?.format('YYYY-MM-DDTHH:mm')"
          type="datetime-local"
          density="compact"
          hide-details
          @update:model-value="(value) => (formTask.objTime = dayjs(value))"
        />
      </div>
    </template>

    <div class="ds-form-group ds-actions">
      <div class="ds-actions-header">
        <span>{{ t("TXT_CODE_COMMON_TASK_PAYLOAD") }}</span>
        <VBtn
          size="small"
          variant="text"
          prepend-icon="mdi-plus-circle-outline"
          @click="addEmptyAction"
        >
          {{ t("TXT_CODE_COMMON_ADD_CONFIGURATION") }}
        </VBtn>
      </div>
      <div class="ds-actions-list">
        <div v-for="(action, index) in formTask.actions" :key="index" class="ds-action-row">
          <VSelect
            v-model="action.type"
            :items="actionTypeItems"
            density="compact"
            hide-details
            class="ds-action-type"
            @update:model-value="action.payload = ''"
          >
            <template #no-data><Empty :icon="false" compact /></template>
          </VSelect>
          <VTextField
            v-model="action.payload"
            density="compact"
            hide-details
            :placeholder="getInputPlaceholder(action) || t('TXT_CODE_COMMON_UNAVAILABLE')"
            :disabled="!getInputPlaceholder(action)"
          />
          <VBtn icon size="small" variant="text" color="error" @click="delAction(index)">
            <VIcon :icon="MinusCircleOutlined" />
          </VBtn>
        </div>
      </div>
    </div>
    <template #footer>
      <VBtn class="ds-dialog-btn ds-dialog-btn--default" variant="text" @click="dialogOpen = false">
        {{ t("TXT_CODE_COMMON_CANCEL") }}
      </VBtn>
      <VBtn
        class="ds-dialog-btn ds-dialog-btn--primary"
        variant="text"
        :disabled="isLoading"
        @click="submitForm"
      >
        <VIcon v-if="isLoading" icon="mdi-loading" />
        {{ t("TXT_CODE_COMMON_SAVE") }}
      </VBtn>
    </template>
  </DesktopDialog>
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

.ds-form-label {
  display: block;
  margin: 10px 0 6px;
  color: var(--desktop-window-text-secondary);
  font-size: 12px;
}

.ds-cycle-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.ds-week-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
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

  &__time,
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

.ds-actions {
  min-width: 0;
  margin-top: 16px;
  container-type: inline-size;
}

.ds-actions-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px 12px;
  margin-bottom: 12px;
  font-weight: 500;
}

.ds-actions-list {
  display: grid;
  gap: 12px;
}

.ds-action-row {
  display: grid;
  grid-template-columns: minmax(160px, 1fr) minmax(0, 2fr) max-content;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 12px;
  background: var(--desktop-window-titlebar-bg);

  > .v-input {
    min-width: 0;
  }
}

@container (max-width: 520px) {
  .ds-action-row {
    grid-template-columns: minmax(0, 1fr) max-content;
  }

  .ds-action-type {
    grid-column: 1 / -1;
  }
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
