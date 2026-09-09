<script setup lang="ts">
import { useOverviewInfo } from "@/hooks/useOverviewInfo";
import { t } from "@/lang/i18n";
import { getUsageColor } from "@/tools/common";
import { hasVersionUpdate } from "@/tools/version";
import type { LayoutCard } from "@/types";
import { computed, ref } from "vue";
import {
  VCard,
  VCardText,
  VChip,
  VIcon,
  VPagination,
  VTable,
  VTooltip
} from "vuetify/components";

defineProps<{ card: LayoutCard }>();

const { state } = useOverviewInfo();
const specifiedDaemonVersion = computed(() => state.value?.specifiedDaemonVersion);

const columns = [
  { title: `${t("TXT_CODE_c7d0002e")}:${t("TXT_CODE_f49149d0")}`, key: "address" },
  { title: t("TXT_CODE_3c8fd4c2"), key: "remark" },
  { title: "CPU", key: "cpu" },
  { title: t("TXT_CODE_593ee330"), key: "mem" },
  { title: t("TXT_CODE_eaed6901"), key: "instances" },
  { title: t("TXT_CODE_3f99f17f"), key: "version" },
  { title: t("TXT_CODE_f80e0786"), key: "status" }
];

const dataSource = computed(() =>
  state.value?.remote.map((node) => {
    const totalMem = node.system?.totalmem ?? 0;
    const freeMem = node.system?.freemem ?? 0;
    const memUsedPercent = totalMem > 0 ? Math.round((1 - freeMem / totalMem) * 100) : undefined;
    const cpuPercent = node.system ? Number((node.system.cpuUsage * 100).toFixed(0)) : undefined;
    const running = node.instance?.running ?? 0;
    const total = node.instance?.total ?? 0;
    return {
      key: node.uuid,
      address: `${node.ip}:${node.port}`,
      remark: node.remarks || "--",
      cpu: node.cpuInfo ?? "--",
      cpuPercent,
      mem: node.memText ?? "--",
      memUsedPercent,
      running,
      total,
      version: node.version || "--",
      status: node.available ? t("TXT_CODE_823bfe63") : t("TXT_CODE_66ce073e"),
      available: node.available
    };
  }) ?? []
);

const currentPage = ref(1);
const pageSize = 8;
const pageCount = computed(() => Math.max(1, Math.ceil(dataSource.value.length / pageSize)));
const pagedDataSource = computed(() => {
  if (currentPage.value > pageCount.value) currentPage.value = pageCount.value;
  const start = (currentPage.value - 1) * pageSize;
  return dataSource.value.slice(start, start + pageSize);
});
</script>

<template>
  <VCard class="node-overview" style="height: 100%" rounded="xl" flat>
    <div class="node-overview-title">{{ card.title }}</div>
    <VCardText class="pa-0">
      <div class="node-overview-wrap" :style="{ height: card.height }">
        <VTable density="compact" class="node-overview-table">
          <thead>
            <tr>
              <th v-for="column in columns" :key="column.key">{{ column.title }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="record in pagedDataSource" :key="record.key">
              <td v-for="column in columns" :key="column.key">
                <template v-if="column.key === 'address'">
                  <span class="text-monospace">{{ record.address }}</span>
                </template>
                <template v-else-if="column.key === 'remark'">{{ record.remark }}</template>
                <template v-else-if="column.key === 'cpu'">
                  <span v-if="record.available" class="text-monospace" :style="{ color: getUsageColor(record.cpuPercent ?? 0) }">
                    {{ record.cpu }}
                  </span>
                  <span v-else>--</span>
                </template>
                <template v-else-if="column.key === 'mem'">
                  <span v-if="record.available" :style="{ color: getUsageColor(record.memUsedPercent ?? 0, 'var(--color-purple-8)') }">
                    {{ record.mem }}
                  </span>
                  <span v-else>--</span>
                </template>
                <template v-else-if="column.key === 'instances'">{{ record.running }} / {{ record.total }}</template>
                <template v-else-if="column.key === 'version'">
                  <VTooltip v-if="record.available && hasVersionUpdate(specifiedDaemonVersion, record.version)" location="top">
                    <template #activator="{ props: tooltipProps }">
                      <span v-bind="tooltipProps" class="color-danger">
                        <VIcon icon="mdi-information-outline" size="16" class="mr-1" />{{ record.version }}
                      </span>
                    </template>
                    <span>{{ t("TXT_CODE_e520908a") }}</span>
                  </VTooltip>
                  <span v-else-if="record.available" class="color-success">
                    <VIcon icon="mdi-check-circle-outline" size="16" class="mr-1" />{{ record.version }}
                  </span>
                  <span v-else>{{ record.version }}</span>
                </template>
                <template v-else>
                  <VChip size="small" :color="record.available ? 'success' : 'secondary'" variant="tonal">
                    {{ record.status }}
                  </VChip>
                </template>
              </td>
            </tr>
          </tbody>
        </VTable>
        <VPagination v-if="pageCount > 1" v-model="currentPage" :length="pageCount" density="compact" total-visible="5" />
      </div>
    </VCardText>
  </VCard>
</template>

<style lang="scss" scoped>
.node-overview {
  background: var(--background-color-white);
  color: var(--text-color);
}

.node-overview-title {
  padding: 16px 20px 8px;
  color: var(--text-color);
  font-size: 16px;
  font-weight: 600;
}

.node-overview-wrap {
  overflow: auto;
  padding: 0 12px 8px;
}

.node-overview-table {
  min-width: 760px;
  background: transparent;
  color: var(--text-color);
  font-size: 12px;
}

.node-overview-table th {
  white-space: nowrap;
  font-weight: 600;
}

.text-monospace {
  font-family: ui-monospace, "Cascadia Code", "Source Code Pro", Menlo, monospace;
}
</style>
