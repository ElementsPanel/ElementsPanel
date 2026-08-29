<script setup lang="ts">
import { router } from "@/config/router";
import { t } from "@/lang/i18n";
import { reportErrorMsg } from "@/tools/validator";
import { EditOutlined, PlusOutlined } from "@ant-design/icons-vue";
import { message } from "ant-design-vue";
import { onMounted, reactive, ref } from "vue";
import { marketSettings, updateMarketSettings, type MarketSettings } from "./api";
import { refreshMarketPermission } from "./runtime";

// The market source address and the "who may install packages" switch used to
// sit on the panel Settings page. They only mean anything while this plugin is
// installed, so the plugin owns and edits them.

const loading = ref(true);
const saving = ref(false);

const formData = reactive<MarketSettings>({
  presetPackAddr: "",
  allowUsePreset: false
});

const allYesNo = [
  { label: t("TXT_CODE_52c8a730"), value: true },
  { label: t("TXT_CODE_718c9310"), value: false }
];

const load = async () => {
  loading.value = true;
  try {
    const { execute } = marketSettings();
    const res = await execute();
    if (res.value) Object.assign(formData, res.value);
  } catch (error: any) {
    reportErrorMsg(error?.message ?? String(error));
  } finally {
    loading.value = false;
  }
};

onMounted(load);

const submit = async () => {
  saving.value = true;
  try {
    const { execute } = updateMarketSettings();
    await execute({ data: { ...formData } });
    message.success(t("TXT_CODE_d3de39b4"));
    await Promise.all([load(), refreshMarketPermission()]);
  } catch (error: any) {
    reportErrorMsg(error?.message ?? String(error));
  } finally {
    saving.value = false;
  }
};

const editTemplate = () => router.push({ path: "/market/editor", query: {} });
const newTemplate = () => router.push({ path: "/market/editor", query: { newTemplate: "true" } });
</script>

<template>
  <a-spin :spinning="loading">
    <div class="market-plugin-config">
      <a-form :model="formData" layout="vertical">
        <a-typography-title :level="4">{{ t("TXT_CODE_27594db8") }}</a-typography-title>

        <a-form-item>
          <a-typography-title :level="5">{{ t("TXT_CODE_6265ae47") }}</a-typography-title>
          <a-typography-paragraph type="secondary">
            {{ t("TXT_CODE_24c4768a") }}
          </a-typography-paragraph>
          <a-input
            v-model:value="formData.presetPackAddr"
            :placeholder="t('TXT_CODE_4ea93630')"
            style="max-width: 320px"
          />
          <a-button class="mx-8" type="primary" @click="editTemplate">
            {{ t("TXT_CODE_ad207008") }}
            <EditOutlined />
          </a-button>
          <a-button @click="newTemplate">
            {{ t("TXT_CODE_53499d7") }}
            <PlusOutlined />
          </a-button>
        </a-form-item>

        <a-form-item>
          <a-typography-title :level="5">{{ t("TXT_CODE_3c93920b") }}</a-typography-title>
          <a-typography-paragraph type="secondary">
            {{ t("TXT_CODE_bc2e52a0") }}
          </a-typography-paragraph>
          <a-select v-model:value.prop="(formData as any).allowUsePreset" style="max-width: 320px">
            <a-select-option v-for="item in allYesNo" :key="String(item.value)" :value="item.value">
              {{ item.label }}
            </a-select-option>
          </a-select>
        </a-form-item>

        <a-form-item>
          <a-button type="primary" :loading="saving" @click="submit">
            {{ t("TXT_CODE_d507abff") }}
          </a-button>
        </a-form-item>
      </a-form>
    </div>
  </a-spin>
</template>

<style lang="scss" scoped>
.market-plugin-config {
  max-width: 900px;
}
</style>
