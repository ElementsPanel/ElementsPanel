<script setup lang="ts">
import { t } from "@/lang/i18n";
import type { TableColumn } from "@/types/table";
import _ from "lodash";
import { computed, onMounted, ref } from "vue";
import { VBtn, VCard, VCardActions, VCardText, VCardTitle, VCheckbox, VDataTable, VDialog, VIcon, VSelect, VSpacer, VTextField } from "vuetify/components";
import { emptyValueValidator, reportValidatorError } from "@/tools/validator";

type Protocol = "tcp" | "udp";
interface DockerPortMapping {
  protocol: Protocol;
  container: string;
  host: string;
}

interface DockerPortMappingWithAutoAssign extends DockerPortMapping {
  autoAssignContainerPort: boolean;
  autoAssignHostPort: boolean;
}

interface Props {
  destroyComponent(delay?: number): void;
  emitResult(data?: DockerPortMapping[]): void;
  data: DockerPortMapping[];
}

const props = defineProps<Props>();
const dataSource = ref<DockerPortMappingWithAutoAssign[]>([]);
const usedPorts = ref<number[]>([]);
const open = ref(true);
const getRecord = (item: any) => item?.raw ?? item;

const columns = computed<TableColumn[]>(() => [
  {
    align: "center",
    dataIndex: "host",
    title: t("TXT_CODE_534db0b2"),
    placeholder: "eg: 8080 or {mcsm_port1}"
  },
  {
    align: "center",
    dataIndex: "container",
    title: t("TXT_CODE_b729d2e"),
    placeholder: "eg: 25565 or {mcsm_port1}"
  },
  {
    align: "center",
    dataIndex: "protocol",
    title: t("TXT_CODE_ad1c674c"),
    placeholder: "tcp/udp"
  },
  {
    align: "center",
    key: "operation",
    dataIndex: "operation",
    title: t("TXT_CODE_fe731dfc")
  }
]);

const emptyPortMapping: DockerPortMappingWithAutoAssign = {
  protocol: "tcp",
  container: "",
  host: "",
  autoAssignContainerPort: false,
  autoAssignHostPort: false
};

const hasMCSMPort = (str: string) => String(str).match(/\{mcsm_port(\d+)\}/);

const cleanupPort = (portValue: string, currentIndex: number) => {
  const portMatch = hasMCSMPort(portValue);
  if (portMatch) {
    const port = parseInt(portMatch[1]);
    const isPortStillUsed = dataSource.value.some(
      (rec, idx) =>
        idx !== currentIndex &&
        ((rec.autoAssignHostPort && hasMCSMPort(rec.host)?.[1] === portMatch[1]) ||
          (rec.autoAssignContainerPort && hasMCSMPort(rec.container)?.[1] === portMatch[1]))
    );
    if (!isPortStillUsed) {
      usedPorts.value = usedPorts.value.filter((p) => p !== port);
    }
  }
};

type OperationType = "add" | "del";
const operation = (type: OperationType, index = 0) => {
  if (type === "add") {
    dataSource.value.push(_.cloneDeep(emptyPortMapping));
  } else {
    // Remove port from usedPorts
    const removedRecord = dataSource.value[index];

    // check and clean host port
    if (removedRecord.autoAssignHostPort) {
      cleanupPort(removedRecord.host, index);
    }

    // check and clean container port
    if (removedRecord.autoAssignContainerPort) {
      cleanupPort(removedRecord.container, index);
    }

    dataSource.value.splice(index, 1);
  }
};

const getNextNumber = (numArr: number[]): number => {
  if (numArr.length === 0) return 1;

  for (let i = 1; i <= numArr.length + 1; i++) {
    if (!numArr.includes(i)) return i;
  }

  return numArr.length + 1;
};

type PortField = "host" | "container";
const handleAutoAssignChange = (record: DockerPortMappingWithAutoAssign, field: PortField) => {
  const otherField = field === "host" ? "container" : "host";
  const autoAssignField = field === "host" ? "autoAssignHostPort" : "autoAssignContainerPort";
  const otherAutoAssignField = field === "host" ? "autoAssignContainerPort" : "autoAssignHostPort";

  if (record[autoAssignField]) {
    const port = hasMCSMPort(record[field]);
    if (port) {
      const portNum = parseInt(port[1]);
      // check if other field is using the same port
      const otherPort = hasMCSMPort(record[otherField]);
      if (!otherPort || parseInt(otherPort[1]) !== portNum || !record[otherAutoAssignField]) {
        // if other field is not using the same port, or other field is not auto assign, then release the port
        usedPorts.value = usedPorts.value.filter((p) => p !== portNum);
      }
    }
    record[autoAssignField] = false;
    record[field] = "";
  } else {
    let portToUse: number;

    const otherPort = hasMCSMPort(record[otherField]);
    if (otherPort && record[otherAutoAssignField]) {
      // Use port from other field
      portToUse = parseInt(otherPort[1]);
    } else {
      portToUse = getNextNumber(usedPorts.value);
      usedPorts.value.push(portToUse);
    }

    record[field] = `{mcsm_port${portToUse}}`;
    record[autoAssignField] = true;
  }
};

const cancel = async () => {
  open.value = false;
  if (props.destroyComponent) props.destroyComponent();
};

const submit = async () => {
  if (dataSource.value.some((item) => !String(item.host || "").trim() || !String(item.container || "").trim() || !String(item.protocol || "").trim())) return reportValidatorError(new Error(t("TXT_CODE_cb08d342")));

  const result: DockerPortMapping[] = dataSource.value.map((item) => ({
    protocol: item.protocol,
    container: item.container,
    host: item.host
  }));

  if (props.emitResult) props.emitResult(result);
  await cancel();
};

onMounted(() => {
  dataSource.value =
    props.data instanceof Array
      ? props.data.map((item) => ({
          ...item,
          autoAssignHostPort: hasMCSMPort(item.host) !== null,
          autoAssignContainerPort: hasMCSMPort(item.container) !== null
        }))
      : [];

  // Initialize used ports
  dataSource.value.forEach((record: DockerPortMappingWithAutoAssign) => {
    (["host", "container"] as const).forEach((key) => {
      const match = hasMCSMPort(record[key]);
      if (match) {
        const portNum = parseInt(match[1]);
        if (!usedPorts.value.includes(portNum)) {
          usedPorts.value.push(portNum);
        }
      }
    });
  });
});
</script>

<template>
  <VDialog v-model="open" max-width="1300" persistent>
    <VCard>
      <VCardTitle>{{ t("TXT_CODE_c4435af9") }}</VCardTitle>
      <VCardText class="dialog-overflow-container">
      <div class="text-body-2 text-medium-emphasis mb-4">
        {{
          t("TXT_CODE_56b9e6af", {
            mcsm_port1: "{mcsm_port1}",
            mcsm_port5: "{mcsm_port5}"
          })
        }}
      </div>
      <div class="d-flex justify-end mb-5">
        <VBtn variant="tonal" @click="operation('add')"><VIcon start icon="mdi-plus-circle-outline" />
          {{ t("TXT_CODE_dfc17a0c") }}
        </VBtn>
      </div>
      <VDataTable :headers="columns.map((column) => ({ title: column.title, key: String(column.dataIndex), align: 'center' as const, sortable: false }))" :items="dataSource" :items-per-page="-1" hide-default-footer density="comfortable">
        <template #item="{ item, index }"><tr><td v-for="column in columns" :key="String(column.dataIndex)">
          <template v-if="column.dataIndex === 'host' || column.dataIndex === 'container'"><div class="d-flex align-center ga-2"><VTextField :model-value="getRecord(item)[String(column.dataIndex)]" type="number" min="1" max="65535" :placeholder="(column as any).placeholder" :disabled="getRecord(item)[column.dataIndex === 'host' ? 'autoAssignHostPort' : 'autoAssignContainerPort']" hide-details="auto" @update:model-value="(value) => (getRecord(item)[String(column.dataIndex)] = value)" /><VCheckbox :model-value="getRecord(item)[column.dataIndex === 'host' ? 'autoAssignHostPort' : 'autoAssignContainerPort']" :label="t('TXT_CODE_6f1129fb')" hide-details @update:model-value="() => handleAutoAssignChange(getRecord(item), column.dataIndex as 'host' | 'container')" /></div></template>
          <VSelect v-else-if="column.dataIndex === 'protocol'" :model-value="getRecord(item).protocol" :items="[{ title: 'TCP', value: 'tcp' }, { title: 'UDP', value: 'udp' }]" hide-details @update:model-value="(value) => (getRecord(item).protocol = value)" />
          <VBtn v-else icon variant="text" color="error" size="small" @click="operation('del', index)"><VIcon icon="mdi-minus-circle-outline" /></VBtn>
        </td></tr></template>
      </VDataTable>
      </VCardText>
      <VCardActions><VSpacer /><VBtn variant="text" @click="cancel">{{ t("TXT_CODE_a0451c97") }}</VBtn><VBtn color="primary" @click="submit">{{ t("TXT_CODE_d507abff") }}</VBtn></VCardActions>
    </VCard>
  </VDialog>
</template>
