<script setup lang="ts">
import { useSchedule } from "@/hooks/useSchedule";
import { ctx } from "@/plugin/context";
import { t } from "@/lang/i18n";
import { reportErrorMsg } from "@/tools/validator";
import type { Schedule, ScheduleAction, ScheduleTaskForm } from "@/types";
import {
  ScheduleActionType,
  ScheduleActionTypeEnum,
  ScheduleCreateType,
  ScheduleType
} from "@/types/const";
import { notification } from "@/tools/vuetifyToast";
import dayjs from "dayjs";
import _ from "lodash";
import { computed, reactive, ref, watch } from "vue";
import AppDialog from "@/components/AppDialog.vue";
import {
  VBtn,
  VCheckbox,
  VCol,
  VForm,
  VRow,
  VSelect,
  VTextField
} from "vuetify/components";

const props = defineProps<{
  daemonId: string;
  instanceId: string;
  modelValue?: boolean;
  task?: Schedule;
}>();
const emit = defineEmits(["update:modelValue", "getScheduleList"]);
const dialogOpen = computed({
  get: () => props.modelValue ?? false,
  set: (value: boolean) => emit("update:modelValue", value)
});
const isLoading = ref(false);
const editMode = ref(false);
const {
  createTaskTypeInterval,
  createTaskTypeCycle,
  createTaskTypeSpecify,
  calculateIntervalFromTime,
  calculateTimeFromCycle,
  parseTaskTime,
  createState,
  deleteSchedule
} = useSchedule(props.instanceId, props.daemonId);

const parseTime = {
  [ScheduleCreateType.INTERVAL]: (time: string) =>
    (newTask.cycle = calculateIntervalFromTime(time)),
  [ScheduleCreateType.CYCLE]: (time: string) => {
    const { objTime, weekend } = calculateTimeFromCycle(time);
    newTask.objTime = objTime;
    newTask.weekend = weekend;
  },
  [ScheduleCreateType.SPECIFY]: (time: string) => (newTask.objTime = parseTaskTime(time))
};
const setTask = (task?: Schedule) => {
  newTask = reactive({
    ..._.cloneDeep(defaultTask),
    ...task,
    count: Number(task?.count) === -1 ? "" : Number(task?.count)
  });

  editMode.value = !!task;

  if (editMode.value) parseTime[newTask.type](newTask.time);
};

const openDialog = (task?: Schedule) => {
  setTask(task);
  emit("update:modelValue", true);
};

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

let newTask = reactive<ScheduleTaskForm>(_.cloneDeep(defaultTask));

watch(
  () => props.modelValue,
  (value) => {
    if (value) setTask(props.task);
  },
  { immediate: true }
);

const scheduleActionTypes = computed(() => {
  const types: Record<string, string> = { ...ScheduleActionType };
  for (const action of ctx.actions.schedules) {
    if (action.condition && !action.condition()) continue;
    types[action.type] = typeof action.title === "function" ? action.title() : action.title;
  }
  return types;
});

const scheduleTypeItems = Object.entries(ScheduleType).map(([value, title]) => ({
  title,
  value: Number(value)
}));
const scheduleActionItems = computed(() =>
  Object.entries(scheduleActionTypes.value).map(([value, title]) => ({ title, value }))
);

const cycleTimeValue = computed({
  get: () => newTask.objTime?.format("HH:mm") ?? "",
  set: (value: string) => {
    const [hour, minute] = value.split(":").map(Number);
    if (Number.isNaN(hour) || Number.isNaN(minute)) return;
    newTask.objTime = newTask.objTime.hour(hour).minute(minute).second(0);
  }
});

const specifyDateTimeValue = computed({
  get: () => newTask.objTime?.format("YYYY-MM-DDTHH:mm") ?? "",
  set: (value: string) => {
    const parsed = dayjs(value);
    if (parsed.isValid()) newTask.objTime = parsed;
  }
});

const toggleWeekend = (value: number) => {
  newTask.weekend = newTask.weekend.includes(value)
    ? newTask.weekend.filter((item) => item !== value)
    : [...newTask.weekend, value];
};

const create = {
  [ScheduleCreateType.INTERVAL]: (newTask: ScheduleTaskForm) => createTaskTypeInterval(newTask),
  [ScheduleCreateType.CYCLE]: (newTask: ScheduleTaskForm) => createTaskTypeCycle(newTask),
  [ScheduleCreateType.SPECIFY]: (newTask: ScheduleTaskForm) => createTaskTypeSpecify(newTask)
};

const getInputPlaceholder = (action: ScheduleAction) => {
  if (action.type === ScheduleActionTypeEnum.Delay) {
    return t("TXT_CODE_bb760145");
  }
  if (action.type === ScheduleActionTypeEnum.Command) {
    return t("TXT_CODE_8ff89011");
  }
  const pluginAction = ctx.actions.schedules.find((item) => item.type === action.type);
  if (!pluginAction?.inputPlaceholder) return;
  return typeof pluginAction.inputPlaceholder === "function"
    ? pluginAction.inputPlaceholder()
    : pluginAction.inputPlaceholder;
};
const submit = async () => {
  try {
    isLoading.value = true;
    if (editMode.value) await deleteSchedule(newTask.name, false);
    await create[newTask.type](newTask);
    if (createState.value) {
      emit("getScheduleList");
      notification.success({
        message: editMode.value ? t("TXT_CODE_d3de39b4") : t("TXT_CODE_d28c05df")
      });
      newTask = reactive(_.cloneDeep(defaultTask));
      emit("update:modelValue", false);
    }
  } catch (err: any) {
    return reportErrorMsg(err.message);
  } finally {
    isLoading.value = false;
  }
};

const addEmptyAction = () => {
  newTask.actions[newTask.actions.length] = _.clone(defaultAction);
};

const delAction = (index: number) => {
  if (newTask.actions.length === 1) {
    return reportErrorMsg(t("TXT_CODE_a749763b"));
  }
  newTask.actions.splice(index, 1);
};

defineExpose({
  openDialog
});
</script>

<template>
  <AppDialog
    v-model:open="dialogOpen"
    class="schedule-dialog"
    :title="editMode ? t('TXT_CODE_1548649e') : t('TXT_CODE_3502273d')"
    :confirm-loading="isLoading"
    :destroy-on-close="true"
    :ok-text="t('TXT_CODE_abfe9512')"
    max-width="660px"
    @ok="submit"
  >
    <VForm class="schedule-form" @submit.prevent="submit">
      <div class="schedule-field">
        <div class="schedule-field-title">{{ t("TXT_CODE_b290a4b0") }}</div>
        <div class="schedule-field-description">{{ t("TXT_CODE_b72d638d") }}</div>
        <VTextField v-model="newTask.name" :disabled="editMode" hide-details />
      </div>

      <div class="schedule-field">
        <div class="schedule-field-title">{{ t("TXT_CODE_a62c99d1") }}</div>
        <VSelect
          v-model="newTask.type"
          :items="scheduleTypeItems"
          :placeholder="t('TXT_CODE_3bb646e4')"
          hide-details
        />
      </div>

      <template v-if="newTask.type === ScheduleCreateType.INTERVAL">
        <div class="schedule-field">
          <div class="schedule-field-title">{{ t("TXT_CODE_3554dac0") }}</div>
          <div class="schedule-field-description">{{ t("TXT_CODE_f17889f4") }}</div>
          <VRow dense>
            <VCol cols="12" md="4">
              <VTextField v-model="newTask.cycle[2]" type="number" :label="t('TXT_CODE_4e2c7f64')" hide-details />
            </VCol>
            <VCol cols="12" md="4">
              <VTextField v-model="newTask.cycle[1]" type="number" :label="t('TXT_CODE_a7e9ff0f')" hide-details />
            </VCol>
            <VCol cols="12" md="4">
              <VTextField v-model="newTask.cycle[0]" type="number" :label="t('TXT_CODE_acabc771')" hide-details />
            </VCol>
          </VRow>
        </div>
        <div class="schedule-field">
          <div class="schedule-field-title">{{ t("TXT_CODE_d9cfab1b") }}</div>
          <VTextField
            v-model.number="newTask.count"
            type="number"
            :placeholder="t('TXT_CODE_a59981f4')"
            hide-details
          />
        </div>
      </template>

      <template v-if="newTask.type === ScheduleCreateType.CYCLE">
        <div class="schedule-field">
          <div class="schedule-field-title">{{ t("TXT_CODE_3554dac0") }}</div>
          <VTextField
            v-model="cycleTimeValue"
            type="time"
            :placeholder="t('TXT_CODE_38591f72')"
            hide-details
          />
        </div>
        <div class="schedule-field">
          <div class="schedule-field-title">{{ t("TXT_CODE_fcbdcb34") }}</div>
          <div class="schedule-weekdays">
            <VCheckbox
              v-for="week in weeks"
              :key="week.value"
              :model-value="newTask.weekend.includes(week.value)"
              :label="week.label"
              hide-details
              density="compact"
              @update:model-value="toggleWeekend(week.value)"
            />
          </div>
        </div>
        <div class="schedule-field">
          <div class="schedule-field-title">{{ t("TXT_CODE_d9cfab1b") }}</div>
          <VTextField
            v-model.number="newTask.count"
            type="number"
            :placeholder="t('TXT_CODE_a59981f4')"
            hide-details
          />
        </div>
      </template>

      <div v-if="newTask.type === ScheduleCreateType.SPECIFY" class="schedule-field">
        <div class="schedule-field-title">{{ t("TXT_CODE_f3fe5c8e") }}</div>
        <VTextField v-model="specifyDateTimeValue" type="datetime-local" hide-details />
      </div>

      <div class="schedule-field schedule-actions-field">
        <div class="schedule-actions-heading">
          <div>
            <div class="schedule-field-title">{{ t("TXT_CODE_61811ac") }}</div>
            <div class="schedule-field-description">{{ t("TXT_CODE_81297804") }}</div>
          </div>
          <VBtn prepend-icon="mdi-plus-circle-outline" variant="text" @click="addEmptyAction">
            {{ t("TXT_CODE_dfc17a0c") }}
          </VBtn>
        </div>
        <VRow v-for="(action, index) in newTask.actions" :key="index" dense class="schedule-action-row">
          <VCol cols="12" md="4">
            <VSelect
              v-model="action.type"
              :items="scheduleActionItems"
              :placeholder="t('TXT_CODE_3bb646e4')"
              hide-details
              @update:model-value="action.payload = ''"
            />
          </VCol>
          <VCol cols="12" md="7">
            <VTextField
              v-model="action.payload"
              :placeholder="getInputPlaceholder(action)"
              :disabled="!getInputPlaceholder(action)"
              hide-details
            />
          </VCol>
          <VCol cols="12" md="1" class="schedule-action-remove">
            <VBtn icon="mdi-minus-circle-outline" color="error" variant="text" @click="delAction(index)" />
          </VCol>
        </VRow>
      </div>
    </VForm>
  </AppDialog>
</template>

<style lang="scss" scoped>
.schedule-form {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.schedule-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.schedule-field-title {
  color: var(--text-color);
  font-size: 15px;
  font-weight: 600;
}

.schedule-field-description {
  color: var(--color-gray-7);
  font-size: 13px;
  line-height: 1.5;
}

.schedule-weekdays {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
}

.schedule-actions-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.schedule-action-row {
  align-items: center;
}

.schedule-action-remove {
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
