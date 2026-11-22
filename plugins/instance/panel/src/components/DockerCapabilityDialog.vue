<script setup lang="ts">
import Empty from "@elementspanel/epanel-plugin-console/components/Empty";
import { t } from "@elementspanel/epanel-plugin-i18n";
import _ from "lodash";
import { computed, onMounted, ref } from "vue";
import { VBtn, VCard, VCardActions, VCardText, VDataTable, VDialog, VIcon, VSelect, VSpacer, VTextField } from "vuetify/components";
import { emptyValueValidator, reportValidatorError } from "@elementspanel/epanel-plugin-console/tools/validator";

type CapabilityOperation = "add" | "drop";
interface DockerCapabilitiesItem {
  label: string;
  value: CapabilityOperation;
}

const emptyCapabilitiesItem: DockerCapabilitiesItem = {
  label: "",
  value: "add"
};

interface Props {
  destroyComponent(delay?: number): void;
  emitResult(data?: DockerCapabilitiesItem[]): void;
  data: DockerCapabilitiesItem[];
  title?: string;
  subTitle?: string;
}

const props = defineProps<Props>();
const dataSource = ref<DockerCapabilitiesItem[]>([]);
const open = ref(true);
const getRecord = (item: any) => item?.raw ?? item;

const columns = computed(() => [
  {
    align: "center" as const,
    dataIndex: "label",
    title: t("TXT_CODE_COMMON_CAPABILITY_NAME"),
    placeholder: t("TXT_CODE_COMMON_ENTER_CAPABILITY_NAME_E_G_NET_ADMIN")
  },
  {
    align: "center" as const,
    dataIndex: "value",
    title: t("TXT_CODE_COMMON_OPERATION_TYPE")
  },
  {
    align: "center" as const,
    key: "operation",
    dataIndex: "operation",
    title: t("TXT_CODE_COMMON_ACTIONS")
  }
]);

type OperationType = "add" | "del";
const operation = (type: OperationType, index = 0) => {
  if (type === "add") {
    dataSource.value.push(_.cloneDeep(emptyCapabilitiesItem));
  } else {
    dataSource.value.splice(index, 1);
  }
};

const cancel = async () => {
  open.value = false;
  if (props.destroyComponent) props.destroyComponent();
};

const submit = async () => {
  if (dataSource.value.some((item) => !String(item.label || "").trim())) return reportValidatorError(new Error(t("TXT_CODE_COMMON_ENTER_CAPABILITY_NAME_E_G_NET_ADMIN")));

  const result: DockerCapabilitiesItem[] = dataSource.value.map((item) => ({
    label: item.label,
    value: item.value
  }));

  if (props.emitResult) props.emitResult(result);
  await cancel();
};

onMounted(() => {
  dataSource.value =
    props.data instanceof Array
      ? props.data.map((item) => ({
          label: item.label,
          value: item.value
        }))
      : [];
});
</script>

<template>
  <VDialog v-model="open" max-width="1300" persistent>
    <VCard :title="t('TXT_CODE_COMMON_CAPABILITIES')">
      <VCardText class="dialog-overflow-container">
      <div v-if="props.subTitle" class="text-body-medium text-medium-emphasis app-mb-4">
        <!-- eslint-disable-next-line vue/no-v-html -->
        <span v-html="props.subTitle"></span>
      </div>
      <div class="d-flex app-justify-end app-mb-5">
        <VBtn variant="tonal" @click="operation('add')"><VIcon start icon="mdi-plus-circle-outline" />
          {{ t("TXT_CODE_COMMON_ADD_CONFIGURATION") }}
        </VBtn>
      </div>
      <VDataTable :headers="columns.map((column) => ({ title: column.title, key: String(column.dataIndex), align: 'center' as const, sortable: false }))" :items="dataSource" :items-per-page="-1" hide-default-footer density="comfortable">
        <template #no-data><Empty icon="mdi-format-list-bulleted" compact /></template>
        <template #item="{ item, index }"><tr><td v-for="column in columns" :key="String(column.dataIndex)">
          <VBtn v-if="column.dataIndex === 'operation'" icon variant="text" color="error" size="small" @click="operation('del', index)"><VIcon icon="mdi-minus-circle-outline" /></VBtn>
          <VTextField v-else-if="column.dataIndex === 'label'" :model-value="getRecord(item).label" :placeholder="(column as any).placeholder" hide-details="auto" @update:model-value="(value) => (getRecord(item).label = value)" />
          <VSelect v-else v-model="getRecord(item).value" :items="[{ title: t('TXT_CODE_COMMON_ADD'), value: 'add' }, { title: t('TXT_CODE_COMMON_DROP'), value: 'drop' }]" hide-details>
            <template #no-data><Empty :icon="false" compact /></template>
          </VSelect>
        </td></tr></template>
      </VDataTable>
      </VCardText>
      <VCardActions><VSpacer /><VBtn variant="text" @click="cancel">{{ t("TXT_CODE_COMMON_CANCEL") }}</VBtn><VBtn color="primary" @click="submit">{{ t("TXT_CODE_COMMON_CONFIRM") }}</VBtn></VCardActions>
    </VCard>
  </VDialog>
</template>

<style lang="scss" scoped>
.dialog-overflow-container {
  max-height: 600px;
  overflow-y: auto;
}
</style>
