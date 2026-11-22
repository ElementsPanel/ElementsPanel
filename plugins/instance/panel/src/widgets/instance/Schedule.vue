<script setup lang="ts">
import Empty from "@elementspanel/epanel-plugin-console/components/Empty";
import PageToolbar from "@elementspanel/epanel-plugin-console/components/PageToolbar";
import { useAppRouters } from "@elementspanel/epanel-plugin-console/hooks/useAppRouters";
import { useSchedule } from "@elementspanel/epanel-plugin-console/hooks/useSchedule";
import { t as $t, t } from "@elementspanel/epanel-plugin-i18n";
import { ctx } from "@elements-panel/sdk";
import { padZero } from "@elementspanel/epanel-plugin-console/tools/common";
import {
  ScheduleActionType,
  ScheduleCreateType,
  ScheduleType
} from "@elementspanel/epanel-plugin-console/types/const";
import type { Schedule } from "@elementspanel/epanel-plugin-console/types";
import { message } from "@elementspanel/epanel-plugin-console/tools/vuetifyToast";
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import {
  VBtn,
  VCard,
  VCardActions,
  VCardText,
  VContainer,
  VDataTable,
  VDialog,
  VSpacer
} from "vuetify/components";
import NewSchedule from "./dialogs/NewSchedule.vue";

const route = useRoute();
const instanceId = String(route.query.instanceId ?? "");
const daemonId = String(route.query.daemonId ?? "");
const pageTitle = computed(() => t("TXT_CODE_COMMON_SCHEDULED_TASKS"));
const { toPage } = useAppRouters();
const scheduleDialogOpen = ref(false);
const scheduleDialogTask = ref<Schedule>();
const { getScheduleList, schedules, scheduleListLoading, deleteSchedule } = useSchedule(
  instanceId,
  daemonId
);

const scheduleActionTypes = computed(() => {
  const types: Record<string, string> = { ...ScheduleActionType };
  for (const action of ctx.actions.schedules) {
    if (action.condition && !action.condition()) continue;
    types[action.type] = typeof action.title === "function" ? action.title() : action.title;
  }
  return types;
});

const timeRender = (text: string, schedule: Schedule) => {
  const formatFunctions = {
    [ScheduleCreateType.INTERVAL]: (t: string) => {
      const time = Number(t);
      const h = padZero(Math.floor(time / 3600).toString());
      const m = padZero(Math.floor((time % 3600) / 60).toString());
      const s = padZero((time % 60).toString());
      return `${$t("TXT_CODE_COMMON_EVERY")} ${h} ${$t("TXT_CODE_TIME_HOURS")} ${m} ${$t(
        "TXT_CODE_TIME_MINUTES"
      )} ${s} ${$t("TXT_CODE_COMMON_SEC")}`;
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

const headers = [
  {
    align: "center",
    title: t("TXT_CODE_SCHEDULE_TASK_NAME"),
    key: "name"
  },
  {
    align: "center",
    title: t("TXT_CODE_COMMON_PAYLOAD"),
    key: "payload"
  },
  {
    align: "center",
    title: t("TXT_CODE_COMMON_REMAINING_COUNT"),
    key: "count",
    sortable: false
  },
  {
    align: "center",
    title: t("TXT_CODE_COMMON_ACTION"),
    key: "action",
    sortable: false
  },
  {
    align: "center",
    title: t("TXT_CODE_FILE_TYPE"),
    key: "type",
    sortable: false
  },
  {
    align: "center",
    title: t("TXT_CODE_COMMON_TRIGGER_TIME"),
    key: "time",
    sortable: false
  },
  {
    align: "center",
    title: t("TXT_CODE_COMMON_ACTIONS"),
    key: "actions",
    sortable: false
  }
] as const;

type ScheduleRow = Schedule & {
  payload: string;
  action: string;
};

const scheduleRows = computed<ScheduleRow[]>(() =>
  ((schedules.value || []) as Schedule[]).map((schedule) => ({
    ...schedule,
    payload: schedule.actions?.[0]?.payload || "",
    action: schedule.actions?.[0]?.type || ""
  }))
);

const rawSchedule = (item: unknown): ScheduleRow =>
  (item as { raw?: ScheduleRow })?.raw || (item as ScheduleRow);
const deleteDialogOpen = ref(false);
const deleteCandidate = ref<Schedule>();
const deleteLoading = ref(false);

const refresh = async () => {
  await getScheduleList();
  message.success(t("TXT_CODE_COMMON_REFRESHED"));
};

const openDeleteDialog = (schedule: Schedule) => {
  deleteCandidate.value = schedule;
  deleteDialogOpen.value = true;
};

const openScheduleDialog = (schedule?: Schedule) => {
  scheduleDialogTask.value = schedule;
  scheduleDialogOpen.value = true;
};

const confirmDelete = async () => {
  if (!deleteCandidate.value) return;
  deleteLoading.value = true;
  try {
    await deleteSchedule(deleteCandidate.value.name);
    deleteDialogOpen.value = false;
    deleteCandidate.value = undefined;
  } finally {
    deleteLoading.value = false;
  }
};

const toConsole = () => {
  toPage({
    path: "/instances/terminal",
    query: {
      daemonId,
      instanceId
    }
  });
};

onMounted(async () => {
  getScheduleList();
});
</script>

<template>
  <main class="schedule-page">
    <VContainer fluid class="schedule-container">
      <PageToolbar :title="pageTitle" icon="mdi-clock-outline">
        <template #actions>
          <VBtn variant="text" prepend-icon="mdi-console-line" @click="toConsole">
            {{ t("TXT_CODE_COMMON_GO_BACK") }}
          </VBtn>
          <VBtn variant="text" prepend-icon="mdi-refresh" @click="refresh">
            {{ t("TXT_CODE_COMMON_REFRESH") }}
          </VBtn>
          <VBtn color="primary" prepend-icon="mdi-plus" @click="openScheduleDialog()">
            {{ t("TXT_CODE_COMMON_NEW_TASK") }}
          </VBtn>
        </template>
      </PageToolbar>

      <VCard rounded="xl" flat>
        <VDataTable
          :headers="headers"
          :items="scheduleRows"
          :items-per-page="15"
          :loading="scheduleListLoading"
          :loading-text="t('TXT_CODE_COMMON_LOADING_DATA')"
          class="schedule-table"
        >
          <template #no-data><Empty icon="mdi-clock-outline" /></template>
          <template #item.count="{ item }">
            {{
              Number(rawSchedule(item).count) > 0
                ? rawSchedule(item).count
                : t("TXT_CODE_SCHEDULE_REPEAT_FOREVER")
            }}
          </template>
          <template #item.action="{ item }">
            {{
              scheduleActionTypes[rawSchedule(item).action] ?? (rawSchedule(item).action || "--")
            }}
          </template>
          <template #item.type="{ item }">
            {{ ScheduleType[rawSchedule(item).type as keyof typeof ScheduleType] ?? "--" }}
          </template>
          <template #item.time="{ item }">
            {{ timeRender(rawSchedule(item).time, rawSchedule(item)) }}
          </template>
          <template #item.actions="{ item }">
            <div class="schedule-row-actions">
              <VBtn
                size="small"
                variant="text"
                prepend-icon="mdi-pencil-outline"
                @click.stop="openScheduleDialog(rawSchedule(item))"
              >
                {{ t("TXT_CODE_COMMON_EDIT") }}
              </VBtn>
              <VBtn
                size="small"
                color="error"
                variant="text"
                prepend-icon="mdi-delete-outline"
                @click="openDeleteDialog(rawSchedule(item))"
              >
                {{ t("TXT_CODE_COMMON_DELETE") }}
              </VBtn>
            </div>
          </template>
        </VDataTable>
      </VCard>
    </VContainer>
    <VDialog v-model="deleteDialogOpen" class="app-dialog" max-width="460px">
      <VCard
        rounded="xl"
        :title="t('TXT_CODE_COMMON_ARE_YOU_SURE_YOU_WANT_TO_DELETE_THIS_SCHEDULED_TASK')"
      >
        <VCardText>
          {{ deleteCandidate?.name || "" }}
        </VCardText>
        <VCardActions>
          <VSpacer />
          <VBtn variant="text" :disabled="deleteLoading" @click="deleteDialogOpen = false">
            {{ t("TXT_CODE_COMMON_CANCEL") }}
          </VBtn>
          <VBtn color="error" :loading="deleteLoading" @click="confirmDelete">
            {{ t("TXT_CODE_COMMON_DELETE") }}
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>

    <Teleport to="body">
      <NewSchedule
        v-model="scheduleDialogOpen"
        :daemon-id="daemonId ?? ''"
        :instance-id="instanceId ?? ''"
        :task="scheduleDialogTask"
        @get-schedule-list="getScheduleList()"
      />
    </Teleport>
  </main>
</template>

<style lang="scss" scoped>
.schedule-page {
  width: 100%;
  min-height: 100%;
  overflow-x: hidden;
}

.schedule-container {
  max-width: var(--app-max-width);
  margin: 0 auto;
  padding: 20px 24px 32px;
}

.schedule-table :deep(th),
.schedule-table :deep(td) {
  white-space: nowrap;
}

.schedule-row-actions {
  display: flex;
  justify-content: center;
  gap: 4px;
}

@media (max-width: 992px) {
  .schedule-container {
    padding: 16px 12px 28px;
  }

  .schedule-row-actions {
    justify-content: flex-start;
  }
}
</style>
