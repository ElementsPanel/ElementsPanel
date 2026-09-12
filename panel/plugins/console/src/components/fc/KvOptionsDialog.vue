<script setup lang="ts">
import { t } from "@/lang/i18n";
import type { MountComponent } from "../../types";
import _ from "lodash";
import { computed, ref } from "vue";
import { VBtn, VCard, VCardActions, VCardText, VCardTitle, VDataTable, VDialog, VForm, VIcon, VSpacer, VTextarea, VTextField } from "vuetify/components";
import { emptyValueValidator, reportValidatorError } from "../../tools/validator";

interface KvColumn {
  align?: string;
  key?: string;
  dataIndex?: string;
  title?: string;
  placeholder?: string;
}

interface Props extends MountComponent {
  title: string;
  keyTitle?: string;
  valueTitle?: string;
  data: any[];
  subTitle?: string;
  columns?: KvColumn[];
  textarea?: boolean;
}

const props = defineProps<Props>();
const dataSource = ref<any[]>(props.data instanceof Array ? _.cloneDeep(props.data) : []);

const open = ref(true);
const formInstance = ref<any>();

const cancel = async () => {
  open.value = false;
  if (props.destroyComponent) props.destroyComponent();
};

const submit = async () => {
  try {
    await formInstance.value?.validate();
  } catch (error: any) {
    return reportValidatorError(error);
  }
  if (props.emitResult) props.emitResult(dataSource.value);
  await cancel();
};

const columns = computed<KvColumn[]>(() => {
  if (props.columns) {
    return [
      ...props.columns,
      {
        align: "center",
        key: "operation",
        dataIndex: "operation",
        title: t("TXT_CODE_fe731dfc")
      }
    ];
  }
  return [
    {
      align: "center",
      key: "k",
      dataIndex: "k",
      title: props.keyTitle
    },
    {
      align: "center",
      key: "v",
      dataIndex: "v",
      title: props.valueTitle
    },
    {
      align: "center",
      key: "operation",
      dataIndex: "operation",
      title: t("TXT_CODE_fe731dfc")
    }
  ];
});

const tableHeaders = computed(() =>
  columns.value.map((column) => ({
    title: column.title || "",
    key: String(column.dataIndex || column.key || ""),
    align: (column.align || "center") as "start" | "center" | "end",
    sortable: false
  }))
);

const getRecord = (item: any) => item?.raw ?? item;
const getColumnKey = (column: KvColumn) => String(column.dataIndex || column.key || "");

const operation = (type: "add" | "del", index = 0) => {
  if (type === "add") {
    const keys = columns.value.filter((v) => v.dataIndex).map((v) => String(v.dataIndex));
    const obj: any = {};
    for (const key of keys) {
      if (key === "operation") continue;
      obj[key] = "";
    }
    dataSource.value.push(obj);
  } else {
    dataSource.value.splice(index, 1);
  }
};
</script>

<template>
  <VDialog v-model="open" class="app-dialog" max-width="1300" persistent>
    <VCard>
      <VCardTitle>{{ props.title }}</VCardTitle>
      <VCardText class="dialog-overflow-container">
      <div v-if="props.subTitle" class="text-body-2 text-medium-emphasis mb-4">
        <!-- eslint-disable-next-line vue/no-v-html -->
        <span v-html="props.subTitle"></span>
      </div>
      <div class="d-flex justify-end mb-5">
        <VBtn variant="tonal" @click="operation('add')">
          <VIcon start icon="mdi-plus-circle-outline" />
          {{ t("TXT_CODE_dfc17a0c") }}
        </VBtn>
      </div>
      <VForm ref="formInstance">
        <VDataTable :headers="tableHeaders" :items="dataSource" :items-per-page="-1" hide-default-footer density="comfortable">
          <template #item="{ item, index }">
            <tr>
              <td v-for="column in columns" :key="getColumnKey(column)" :class="`text-${column.align || 'center'}`">
                <VBtn v-if="getColumnKey(column) === 'operation'" icon variant="text" color="error" size="small" @click="operation('del', index)">
                  <VIcon icon="mdi-minus-circle-outline" />
                </VBtn>
                <VTextarea
                  v-else-if="props.textarea"
                  :model-value="getRecord(item)[getColumnKey(column)]"
                  :placeholder="column.placeholder"
                  rows="2"
                  auto-grow
                  hide-details="auto"
                  :rules="[(value) => emptyValueValidator(value).then(() => true).catch((error) => error.message)]"
                  @update:model-value="(value) => (getRecord(item)[getColumnKey(column)] = value)"
                />
                <VTextField
                  v-else
                  :model-value="getRecord(item)[getColumnKey(column)]"
                  :placeholder="column.placeholder"
                  hide-details="auto"
                  :rules="[(value) => emptyValueValidator(value).then(() => true).catch((error) => error.message)]"
                  @update:model-value="(value) => (getRecord(item)[getColumnKey(column)] = value)"
                />
              </td>
            </tr>
          </template>
        </VDataTable>
      </VForm>
      </VCardText>
      <VCardActions>
        <VSpacer />
        <VBtn variant="text" @click="cancel">{{ t("TXT_CODE_a0451c97") }}</VBtn>
        <VBtn color="primary" @click="submit">{{ t("TXT_CODE_d507abff") }}</VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<style lang="scss" scoped></style>
