<script setup lang="ts">
import { t } from "@/lang/i18n";
import { reportErrorMsg } from "@/tools/validator";
import { message } from "ant-design-vue";
import { onMounted, reactive, ref } from "vue";
import { serverSettings, updateServerSettings, type ServerSettings } from "./api";

// Port, listening address, path prefix, SSL, CORS and reverse proxy used to sit
// on the panel Settings page. They only describe the web server this plugin
// runs, so they are edited here and disappear with it.

const loading = ref(true);
const saving = ref(false);

const formData = reactive<ServerSettings>({
  httpPort: 23333,
  httpIp: "",
  prefix: "",
  ssl: false,
  sslPemPath: "",
  sslKeyPath: "",
  crossDomain: false,
  reverseProxyMode: false,
  reverseProxyHeader: "X-Real-IP"
});

const allYesNo = [
  { label: t("TXT_CODE_52c8a730"), value: true },
  { label: t("TXT_CODE_718c9310"), value: false }
];

const load = async () => {
  loading.value = true;
  try {
    const { execute } = serverSettings();
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
    const { execute } = updateServerSettings();
    await execute({ data: { ...formData, httpPort: Number(formData.httpPort) } });
    message.success(t("TXT_CODE_d3de39b4"));
    await load();
  } catch (error: any) {
    reportErrorMsg(error?.message ?? String(error));
  } finally {
    saving.value = false;
  }
};
</script>

<template>
  <a-spin :spinning="loading">
    <div class="server-plugin-config">
      <a-form :model="formData" layout="vertical">
        <a-typography-title :level="4">{{ t("TXT_CODE_SERVER_TITLE") }}</a-typography-title>
        <a-typography-paragraph type="secondary">
          {{ t("TXT_CODE_SERVER_RESTART_TIP") }}
        </a-typography-paragraph>

        <a-form-item>
          <a-typography-title :level="5">{{ t("TXT_CODE_7f0017d2") }}</a-typography-title>
          <a-typography-paragraph type="secondary">
            {{ t("TXT_CODE_233624ad") }}
          </a-typography-paragraph>
          <a-input
            v-model:value="formData.httpPort"
            style="max-width: 320px"
            :placeholder="t('TXT_CODE_4ea93630')"
          />
        </a-form-item>

        <a-form-item>
          <a-typography-title :level="5">{{ t("TXT_CODE_514e064a") }}</a-typography-title>
          <a-typography-paragraph type="secondary">
            {{ t("TXT_CODE_328191e") }}
          </a-typography-paragraph>
          <a-input
            v-model:value="formData.httpIp"
            style="max-width: 320px"
            :placeholder="t('TXT_CODE_4ea93630')"
          />
        </a-form-item>

        <a-form-item>
          <a-typography-title :level="5">{{ t("TXT_CODE_SERVER_PREFIX") }}</a-typography-title>
          <a-typography-paragraph type="secondary">
            {{ t("TXT_CODE_SERVER_PREFIX_TIP") }}
          </a-typography-paragraph>
          <a-input
            v-model:value="formData.prefix"
            style="max-width: 320px"
            :placeholder="t('TXT_CODE_4ea93630')"
          />
        </a-form-item>

        <a-form-item>
          <a-typography-title :level="5">{{ t("TXT_CODE_SERVER_SSL") }}</a-typography-title>
          <a-typography-paragraph type="secondary">
            {{ t("TXT_CODE_SERVER_SSL_TIP") }}
          </a-typography-paragraph>
          <a-select v-model:value.prop="(formData as any).ssl" style="max-width: 320px">
            <a-select-option v-for="item in allYesNo" :key="String(item.value)" :value="item.value">
              {{ item.label }}
            </a-select-option>
          </a-select>
        </a-form-item>

        <a-form-item v-show="formData.ssl">
          <a-typography-title :level="5">{{ t("TXT_CODE_SERVER_SSL_PEM") }}</a-typography-title>
          <a-typography-paragraph type="secondary">
            {{ t("TXT_CODE_SERVER_SSL_PEM_TIP") }}
          </a-typography-paragraph>
          <a-input
            v-model:value="formData.sslPemPath"
            style="max-width: 320px"
            :placeholder="t('TXT_CODE_4ea93630')"
          />
        </a-form-item>

        <a-form-item v-show="formData.ssl">
          <a-typography-title :level="5">{{ t("TXT_CODE_SERVER_SSL_KEY") }}</a-typography-title>
          <a-typography-paragraph type="secondary">
            {{ t("TXT_CODE_SERVER_SSL_KEY_TIP") }}
          </a-typography-paragraph>
          <a-input
            v-model:value="formData.sslKeyPath"
            style="max-width: 320px"
            :placeholder="t('TXT_CODE_4ea93630')"
          />
        </a-form-item>

        <a-form-item>
          <a-typography-title :level="5">{{ t("TXT_CODE_405cd346") }}</a-typography-title>
          <a-typography-paragraph type="secondary">
            {{ t("TXT_CODE_6655c905") }}
          </a-typography-paragraph>
          <a-select v-model:value.prop="(formData as any).crossDomain" style="max-width: 320px">
            <a-select-option v-for="item in allYesNo" :key="String(item.value)" :value="item.value">
              {{ item.label }}
            </a-select-option>
          </a-select>
        </a-form-item>

        <a-form-item>
          <a-typography-title :level="5">{{ t("TXT_CODE_f0789d81") }}</a-typography-title>
          <a-typography-paragraph type="secondary">
            {{ t("TXT_CODE_2b85af6d") }}
          </a-typography-paragraph>
          <a-select v-model:value.prop="(formData as any).reverseProxyMode" style="max-width: 320px">
            <a-select-option v-for="item in allYesNo" :key="String(item.value)" :value="item.value">
              {{ item.label }}
            </a-select-option>
          </a-select>
        </a-form-item>

        <a-form-item v-show="formData.reverseProxyMode">
          <a-typography-title :level="5">{{ t("TXT_CODE_66aeac82") }}</a-typography-title>
          <a-typography-paragraph type="secondary">
            {{ t("TXT_CODE_fd8bc51f") }}
          </a-typography-paragraph>
          <a-input
            v-model:value="formData.reverseProxyHeader"
            style="max-width: 320px"
            :placeholder="t('TXT_CODE_4ea93630')"
          />
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
.server-plugin-config {
  max-width: 900px;
}
</style>
