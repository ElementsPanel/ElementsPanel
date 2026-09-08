<script setup lang="ts">
import PageToolbar from "@/components/PageToolbar.vue";
import { useAppRouters } from "@/hooks/useAppRouters";
import { useLayoutCardTools } from "@/hooks/useCardTools";
import { useSchedule } from "@/hooks/useSchedule";
import { t as $t, t } from "@/lang/i18n";
import { ctx } from "@/plugin/context";
import { padZero } from "@/tools/common";
import { ScheduleActionType, ScheduleCreateType, ScheduleType } from "@/types/const";
import type { LayoutCard, Schedule } from "@/types/index";
import { message } from "ant-design-vue";
import { computed, onMounted, ref } from "vue";
import {
  VBtn,
  VCard,
  VCardActions,
  VCardText,
  VContainer,
  VDataTable,
  VDialog,
  VSpacer
} from "vuetify/lib/components/index.mjs";
import NewSchedule from "./dialogs/NewSchedule.vue";

const props = defineProps<{
  card?: LayoutCard;
}>();

const card = props.card ?? ({ meta: {} } as LayoutCard);
const { getMetaOrRouteValue } = useLayoutCardTools(card);
const instanceId = getMetaOrRouteValue("instanceId", false);
const daemonId = getMetaOrRouteValue("daemonId", false);
const pageTitle = computed(() => props.card?.title || t("TXT_CODE_b7d026f8"));
const { toPage } = useAppRouters();
const scheduleDialogOpen = ref(false);
const scheduleDialogTask = ref<Schedule>();
const { getScheduleList, schedules, scheduleListLoading, deleteSchedule } = useSchedule(
  String(instanceId ?? ""),
  String(daemonId ?? "")
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
      return `${$t("TXT_CODE_ec6d29f4")} ${h} ${$t("TXT_CODE_e3db239d")} ${m} ${$t(
        "TXT_CODE_3b1bb444"
      )} ${s} ${$t("TXT_CODE_acabc771")}`;
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

const headers = [
  {
    align: "center",
    title: t("TXT_CODE_2d542e4c"),
    key: "name"
  },
  {
    align: "center",
    title: t("TXT_CODE_1544562"),
    key: "payload"
  },
  {
    align: "center",
    title: t("TXT_CODE_485e2d41"),
    key: "count",
    sortable: false
  },
  {
    align: "center",
    title: t("TXT_CODE_82fbc5ad"),
    key: "action",
    sortable: false
  },
  {
    align: "center",
    title: t("TXT_CODE_67d68dd1"),
    key: "type",
    sortable: false
  },
  {
    align: "center",
    title: t("TXT_CODE_3554dac0"),
    key: "time",
    sortable: false
  },
  {
    align: "center",
    title: t("TXT_CODE_fe731dfc"),
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
  message.success(t("TXT_CODE_fbde647e"));
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
            {{ t("TXT_CODE_c14b2ea3") }}
          </VBtn>
          <VBtn variant="text" prepend-icon="mdi-refresh" @click="refresh">
            {{ t("TXT_CODE_b76d94e0") }}
          </VBtn>
          <VBtn color="primary" prepend-icon="mdi-plus" @click="openScheduleDialog()">
            {{ t("TXT_CODE_1644b775") }}
          </VBtn>
        </template>
      </PageToolbar>

      <VCard class="schedule-card" rounded="xl" flat>
        <VDataTable :headers="headers" :items="scheduleRows" :items-per-page="15" :loading="scheduleListLoading"
          :loading-text="t('TXT_CODE_b197be11')" :no-data-text="t('TXT_CODE_NO_DATA')" class="schedule-table">
          <template #item.count="{ item }">
            {{ Number(rawSchedule(item).count) > 0 ? rawSchedule(item).count : t("TXT_CODE_a92df201") }}
          </template>
          <template #item.action="{ item }">
            {{ scheduleActionTypes[rawSchedule(item).action] ?? (rawSchedule(item).action || "--") }}
          </template>
          <template #item.type="{ item }">
            {{ ScheduleType[rawSchedule(item).type as keyof typeof ScheduleType] ?? "--" }}
          </template>
          <template #item.time="{ item }">
            {{ timeRender(rawSchedule(item).time, rawSchedule(item)) }}
          </template>
          <template #item.actions="{ item }">
            <div class="schedule-row-actions">
              <VBtn size="small" variant="text" prepend-icon="mdi-pencil-outline"
                @click.stop="openScheduleDialog(rawSchedule(item))">
                {{ t("TXT_CODE_ad207008") }}
              </VBtn>
              <VBtn size="small" color="error" variant="text" prepend-icon="mdi-delete-outline"
                @click="openDeleteDialog(rawSchedule(item))">
                {{ t("TXT_CODE_ecbd7449") }}
              </VBtn>
            </div>
          </template>
        </VDataTable>
      </VCard>
    </VContainer>
    <VDialog v-model="deleteDialogOpen" class="app-dialog" max-width="460px">
      <VCard rounded="xl" :title="t('TXT_CODE_6ff0668f')">
        <VCardText>
          {{ deleteCandidate?.name || "" }}
        </VCardText>
        <VCardActions>
          <VSpacer />
          <VBtn variant="text" :disabled="deleteLoading" @click="deleteDialogOpen = false">
            {{ t("TXT_CODE_a0451c97") }}
          </VBtn>
          <VBtn color="error" :loading="deleteLoading" @click="confirmDelete">
            {{ t("TXT_CODE_ecbd7449") }}
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>

    <Teleport to="body">
      <NewSchedule v-model="scheduleDialogOpen" :daemon-id="daemonId ?? ''" :instance-id="instanceId ?? ''"
        :task="scheduleDialogTask" @get-schedule-list="getScheduleList()" />
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

.schedule-card {
  overflow: hidden;
  background: var(--background-color-white);
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
