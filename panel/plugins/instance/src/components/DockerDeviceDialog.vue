<script setup lang="ts">
import { t } from "@/lang/i18n";
import _ from "lodash";
import { computed, onMounted, ref } from "vue";
import { VBtn, VCard, VCardActions, VCardText, VCardTitle, VDataTable, VDialog, VIcon, VSpacer, VTextField } from "vuetify/components";
import { emptyValueValidator, reportValidatorError } from "@/tools/validator";

interface DockerDeviceItem {
  PathOnHost: string;
  PathInContainer: string | undefined;
  CgroupPermissions: string | undefined;
}

const emptyDeviceItem: DockerDeviceItem = {
  PathOnHost: "",
  PathInContainer: undefined,
  CgroupPermissions: undefined
};

interface Props {
  destroyComponent(delay?: number): void;
  emitResult(data?: DockerDeviceItem[]): void;
  data: DockerDeviceItem[];
  title?: string;
  subTitle?: string;
}

const props = defineProps<Props>();

const dataSource = ref<DockerDeviceItem[]>([]);
const open = ref(true);
const getRecord = (item: any) => item?.raw ?? item;

const columns = computed(() => [
  {
    align: "center" as const,
    dataIndex: "PathOnHost",
    title: t("TXT_CODE_e4a82ac7"),
    placeholder: t("TXT_CODE_1d8ece48")
  },
  {
    align: "center" as const,
    dataIndex: "PathInContainer",
    title: t("TXT_CODE_ef6115b7"),
    placeholder: t("TXT_CODE_1d8ece49")
  },
  {
    align: "center" as const,
    dataIndex: "CgroupPermissions",
    title: t("TXT_CODE_511aea70"),
    placeholder: t("TXT_CODE_7595d100")
  },
  {
    align: "center" as const,
    key: "operation",
    dataIndex: "operation",
    title: t("TXT_CODE_fe731dfc")
  }
]);

type OperationType = "add" | "del";

const operation = (type: OperationType, index = 0) => {
  if (type === "add") {
    dataSource.value.push(_.cloneDeep(emptyDeviceItem));
  } else {
    dataSource.value.splice(index, 1);
  }
};

const cancel = async () => {
  open.value = false;
  if (props.destroyComponent) props.destroyComponent();
};

const submit = async () => {
  if (dataSource.value.some((item) => !String(item.PathOnHost || "").trim())) return reportValidatorError(new Error(t("TXT_CODE_1d8ece48")));

  const result: DockerDeviceItem[] = dataSource.value.map((item) => ({
    PathOnHost: item.PathOnHost,
    PathInContainer: item.PathInContainer,
    CgroupPermissions: item.CgroupPermissions
  }));

  if (props.emitResult) props.emitResult(result);
  await cancel();
};

onMounted(() => {
  dataSource.value =
    props.data instanceof Array
      ? props.data.map((item) => ({
          PathOnHost: item.PathOnHost,
          PathInContainer: item.PathInContainer,
          CgroupPermissions: item.CgroupPermissions
        }))
      : [];
});
</script>

<template>
  <VDialog v-model="open" max-width="1300" persistent>
    <VCard>
      <VCardTitle>{{ props.title || t("TXT_CODE_b3a60c78") }}</VCardTitle>
      <VCardText class="dialog-overflow-container">
      <div v-if="props.subTitle" class="text-body-2 text-medium-emphasis mb-4">
        <!-- eslint-disable-next-line vue/no-v-html -->
        <span v-html="props.subTitle"></span>
      </div>

      <div class="d-flex justify-end mb-5">
        <VBtn variant="tonal" @click="operation('add')"><VIcon start icon="mdi-plus-circle-outline" />
          {{ t("TXT_CODE_dfc17a0c") }}
        </VBtn>
      </div>
      <VDataTable :headers="columns.map((column) => ({ title: column.title, key: String(column.dataIndex), align: 'center' as const, sortable: false }))" :items="dataSource" :items-per-page="-1" hide-default-footer density="comfortable">
        <template #item="{ item, index }"><tr><td v-for="column in columns" :key="String(column.dataIndex)">
          <VBtn v-if="column.dataIndex === 'operation'" icon variant="text" color="error" size="small" @click="operation('del', index)"><VIcon icon="mdi-minus-circle-outline" /></VBtn>
          <VTextField v-else :model-value="getRecord(item)[String(column.dataIndex)]" :placeholder="(column as any).placeholder" hide-details="auto" @update:model-value="(value) => (getRecord(item)[String(column.dataIndex)] = value)" />
        </td></tr></template>
      </VDataTable>
      </VCardText>
      <VCardActions><VSpacer /><VBtn variant="text" @click="cancel">{{ t("TXT_CODE_a0451c97") }}</VBtn><VBtn color="primary" @click="submit">{{ t("TXT_CODE_d507abff") }}</VBtn></VCardActions>
    </VCard>
  </VDialog>
</template>

<style lang="scss" scoped>
.dialog-overflow-container {
  max-height: 600px;
  overflow-y: auto;
}

.flex-center {
  display: flex;
  align-items: center;
}

.flex-between {
  justify-content: space-between;
}
</style>
