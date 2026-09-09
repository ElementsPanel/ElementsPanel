<script setup lang="ts">
import { t } from "@/lang/i18n";
import { EditOutlined } from "@ant-design/icons-vue";
import { computed, onMounted, ref } from "vue";
import { VBtn, VCard, VCardText, VCol, VIcon, VRow, VSelect, VTextField } from "vuetify/components";

const FLOAT_MAGIC_PREFIX = "<__float__>";
const props = defineProps<{
  optionValue?: Record<string, any>;
  optionKey?: any;
  custom?: boolean;
  isDesktop?: boolean;
}>();

enum CONTROL {
  SELECT = 1,
  INPUT = 2
}

const value = ref<Record<string, any>>({});
const key = ref();
const type = ref(2);

const computedValue = computed({
  get: () => {
    const v = value.value[key.value];
    if (typeof v === "string" && v.startsWith(FLOAT_MAGIC_PREFIX)) {
      return v.replace(FLOAT_MAGIC_PREFIX, "");
    }
    return v;
  },
  set: (v) => {
    const preValue = value.value[key.value];
    if (typeof preValue === "string" && preValue.startsWith(FLOAT_MAGIC_PREFIX)) {
      value.value[key.value] = `${FLOAT_MAGIC_PREFIX}${v}`;
      return;
    }
    value.value[key.value] = v;
  }
});

const valueType = computed(() => {
  if (typeof value.value[key.value] === "boolean") {
    return CONTROL.SELECT;
  }
  return CONTROL.INPUT;
});

const forceType = () => {
  if (type.value >= 2) return (type.value = 1);
  type.value = type.value + 1;
};

onMounted(() => {
  if (props.custom) return;
  if (props.optionValue) value.value = props.optionValue;
  if (props.optionKey) key.value = props.optionKey;
  type.value = valueType.value;
});
</script>

<template>
  <div class="line-option-wrapper">
    <VCard v-if="isDesktop" class="line-option-card" variant="tonal" rounded="xl">
      <VCardText>
        <div v-if="!custom">
          <VRow dense align="center">
            <VCol cols="12" md="7"><slot name="title"></slot></VCol>
            <VCol cols="12" md="11"><slot name="info"></slot></VCol>
            <VCol cols="12" md="6">
              <div v-if="$slots.optionInput"><slot name="optionInput"></slot></div>
              <div v-else class="line-option-control">
                <VTextField v-if="type == CONTROL.INPUT" v-model="computedValue" variant="solo" density="compact" hide-details />
                <VSelect v-else v-model="computedValue" :items="[{ title: t('TXT_CODE_addfcb6b'), value: true }, { title: t('TXT_CODE_1e9c479e'), value: false }]" variant="solo" density="compact" hide-details />
                <VBtn v-if="type == CONTROL.SELECT" icon variant="text" size="small" rounded="xl" @click="forceType"><VIcon icon="mdi-pencil-outline" /></VBtn>
              </div>
            </VCol>
          </VRow>
        </div>
        <div v-else><slot></slot></div>
      </VCardText>
    </VCard>
    <a-card v-else class="line-option-card" :body-style="{ padding: '10px' }">
      <div v-if="!custom">
        <a-row :gutter="[10, 10]" align="middle">
          <a-col :md="7" :span="24">
            <slot name="title"></slot>
          </a-col>
          <a-col :md="11" :span="24">
            <slot name="info"></slot>
          </a-col>
          <a-col :md="6" :span="24">
            <div v-if="$slots.optionInput">
              <slot name="optionInput"></slot>
            </div>
            <div v-else class="flex">
              <a-input v-if="type == CONTROL.INPUT" v-model:value="computedValue" />
              <a-select
                v-if="type == CONTROL.SELECT"
                v-model:value="computedValue"
                style="width: 100%"
                :placeholder="t('TXT_CODE_fe3f34e6')"
              >
                <a-select-option :value="true">{{ t("TXT_CODE_addfcb6b") }}</a-select-option>
                <a-select-option :value="false">{{ t("TXT_CODE_1e9c479e") }}</a-select-option>
              </a-select>
              <a-button v-if="type == CONTROL.SELECT" class="ml-8" @click="forceType">
                <EditOutlined />
              </a-button>
            </div>
          </a-col>
        </a-row>
      </div>
      <div v-else>
        <slot></slot>
      </div>
    </a-card>
  </div>
</template>

<style lang="scss" scoped>
.line-option-wrapper {
  width: 100%;
  margin-bottom: 6px;
  .line-option-card {
    transition: all 0.4s;
    border-radius: 6px;
  }
  .line-option-card:hover {
    box-shadow: 0 2px 4px 0 rgba(0, 0, 0, 0.16);
  }
}

.line-option-control { display: flex; align-items: center; gap: 6px; }
.line-option-control :deep(.v-input) { flex: 1; min-width: 0; }
</style>
