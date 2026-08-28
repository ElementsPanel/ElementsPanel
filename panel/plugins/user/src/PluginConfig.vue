<script setup lang="ts">
import { t } from "@/lang/i18n";
import { reportErrorMsg } from "@/tools/validator";
import { message } from "ant-design-vue";
import { computed, onMounted, reactive, ref } from "vue";
import { getAuthSettings, setAuthSettings, type AuthSettings } from "./api";

// Authentication settings used to live on the panel Settings page. They belong
// to this plugin, so they are edited here and stored in the plugin's own record.

const loading = ref(true);
const saving = ref(false);

const formData = reactive<AuthSettings>({
  loginInfo: "",
  loginCheckIp: true,
  totpDriftToleranceSteps: 0,
  ssoEnabled: false,
  ssoType: "oidc",
  ssoOnlyMode: false,
  ssoAutoRedirect: false,
  ssoProviderName: "",
  ssoIconUrl: "",
  ssoIssuer: "",
  ssoAuthorizeUrl: "",
  ssoTokenUrl: "",
  ssoUserinfoUrl: "",
  ssoUserIdField: "id",
  ssoScopes: "",
  ssoClientId: "",
  ssoClientSecret: "",
  ssoCallbackUrl: ""
});

const allYesNo = [
  { label: t("TXT_CODE_52c8a730"), value: true },
  { label: t("TXT_CODE_718c9310"), value: false }
];

const totpDriftOptions = [
  { label: t("TXT_CODE_718c9310"), value: 0 },
  { label: "30 s", value: 1 },
  { label: "60 s", value: 2 }
];

const ssoMode = computed({
  get: () => {
    if (!formData.ssoEnabled) return "disabled";
    return formData.ssoType === "oauth2" ? "oauth2" : "oidc";
  },
  set: (value: string) => {
    if (value === "disabled") {
      formData.ssoEnabled = false;
      return;
    }
    formData.ssoEnabled = true;
    formData.ssoType = value as "oidc" | "oauth2";
  }
});

const load = async () => {
  loading.value = true;
  try {
    const { execute } = getAuthSettings();
    const res = await execute();
    if (res.value) Object.assign(formData, res.value);
  } catch (error: any) {
    reportErrorMsg(error?.message ?? String(error));
  } finally {
    loading.value = false;
  }
};

onMounted(load);

const validate = () => {
  if (!formData.ssoEnabled) return true;
  // The server keeps the stored secret when this field is left blank, so an
  // empty value is only a problem the first time SSO is turned on.
  if (!formData.ssoClientId?.trim()) {
    reportErrorMsg(t("TXT_CODE_SSO_ENABLE_REQUIRES_CONFIG"));
    return false;
  }
  if (formData.ssoType === "oauth2") {
    if (
      !formData.ssoAuthorizeUrl?.trim() ||
      !formData.ssoTokenUrl?.trim() ||
      !formData.ssoUserinfoUrl?.trim()
    ) {
      reportErrorMsg(t("TXT_CODE_SSO_OAUTH2_REQUIRES_URLS"));
      return false;
    }
  } else if (!formData.ssoIssuer?.trim()) {
    reportErrorMsg(t("TXT_CODE_SSO_ENABLE_REQUIRES_CONFIG"));
    return false;
  }
  return true;
};

const submit = async () => {
  if (!validate()) return;
  saving.value = true;
  try {
    const { execute } = setAuthSettings();
    await execute({ data: { ...formData } });
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
    <div class="user-plugin-config">
      <a-form :model="formData" layout="vertical">
        <a-typography-title :level="4">{{ t("TXT_CODE_9c3ca8f") }}</a-typography-title>

        <a-form-item>
          <a-typography-title :level="5">{{ t("TXT_CODE_b5b33dd4") }}</a-typography-title>
          <a-typography-paragraph type="secondary">
            {{ t("TXT_CODE_c26e5fb7") }}
          </a-typography-paragraph>
          <a-textarea
            v-model:value="formData.loginInfo"
            :rows="4"
            :placeholder="t('TXT_CODE_4ea93630')"
          />
        </a-form-item>

        <a-form-item>
          <a-typography-title :level="5">{{ t("TXT_CODE_1d67c9c6") }}</a-typography-title>
          <a-typography-paragraph type="secondary">
            {{ t("TXT_CODE_745fc959") }}
          </a-typography-paragraph>
          <a-select v-model:value.prop="(formData as any).loginCheckIp" style="max-width: 320px">
            <a-select-option v-for="item in allYesNo" :key="String(item.value)" :value="item.value">
              {{ item.label }}
            </a-select-option>
          </a-select>
        </a-form-item>

        <a-form-item>
          <a-typography-title :level="5">{{ t("TXT_CODE_b026be33") }}</a-typography-title>
          <a-typography-paragraph type="secondary">
            {{ t("TXT_CODE_a77b1a21") }}
          </a-typography-paragraph>
          <a-select v-model:value="formData.totpDriftToleranceSteps" style="max-width: 320px">
            <a-select-option v-for="item in totpDriftOptions" :key="item.value" :value="item.value">
              {{ item.label }}
            </a-select-option>
          </a-select>
        </a-form-item>

        <a-divider />

        <a-typography-title :level="4">{{ t("TXT_CODE_SSO_TAB_TITLE") }}</a-typography-title>

        <a-form-item>
          <a-typography-title :level="5">{{ t("TXT_CODE_SSO_ENABLE") }}</a-typography-title>
          <a-typography-paragraph type="secondary">
            {{ t("TXT_CODE_SSO_ENABLE_DESC") }}
          </a-typography-paragraph>
          <a-select v-model:value="ssoMode" style="max-width: 320px">
            <a-select-option value="disabled">{{ t("TXT_CODE_718c9310") }}</a-select-option>
            <a-select-option value="oidc">OpenID Connect (OIDC)</a-select-option>
            <a-select-option value="oauth2">OAuth 2.0</a-select-option>
          </a-select>
        </a-form-item>

        <template v-if="formData.ssoEnabled">
          <a-form-item>
            <a-typography-title :level="5">{{ t("TXT_CODE_SSO_PROVIDER_NAME") }}</a-typography-title>
            <a-typography-paragraph type="secondary">
              {{ t("TXT_CODE_SSO_PROVIDER_NAME_DESC") }}
            </a-typography-paragraph>
            <a-input
              v-model:value="formData.ssoProviderName"
              style="max-width: 320px"
              :placeholder="t('TXT_CODE_4ea93630')"
            />
          </a-form-item>

          <a-form-item>
            <a-typography-title :level="5">{{ t("TXT_CODE_SSO_ICON_URL") }}</a-typography-title>
            <a-typography-paragraph type="secondary">
              {{ t("TXT_CODE_SSO_ICON_URL_DESC") }}
            </a-typography-paragraph>
            <a-input
              v-model:value="formData.ssoIconUrl"
              style="max-width: 320px"
              :placeholder="t('TXT_CODE_4ea93630')"
            />
          </a-form-item>

          <a-form-item v-if="ssoMode === 'oidc'">
            <a-typography-title :level="5">{{ t("TXT_CODE_SSO_ISSUER") }}</a-typography-title>
            <a-typography-paragraph type="secondary">
              {{ t("TXT_CODE_SSO_ISSUER_DESC") }}
            </a-typography-paragraph>
            <a-input
              v-model:value="formData.ssoIssuer"
              style="max-width: 480px"
              placeholder="https://accounts.example.com"
            />
          </a-form-item>

          <template v-if="ssoMode === 'oauth2'">
            <a-form-item>
              <a-typography-title :level="5">
                {{ t("TXT_CODE_SSO_AUTHORIZE_URL") }}
              </a-typography-title>
              <a-typography-paragraph type="secondary">
                {{ t("TXT_CODE_SSO_AUTHORIZE_URL_DESC") }}
              </a-typography-paragraph>
              <a-input
                v-model:value="formData.ssoAuthorizeUrl"
                style="max-width: 480px"
                placeholder="https://github.com/login/oauth/authorize"
              />
            </a-form-item>

            <a-form-item>
              <a-typography-title :level="5">{{ t("TXT_CODE_SSO_TOKEN_URL") }}</a-typography-title>
              <a-typography-paragraph type="secondary">
                {{ t("TXT_CODE_SSO_TOKEN_URL_DESC") }}
              </a-typography-paragraph>
              <a-input
                v-model:value="formData.ssoTokenUrl"
                style="max-width: 480px"
                placeholder="https://github.com/login/oauth/access_token"
              />
            </a-form-item>

            <a-form-item>
              <a-typography-title :level="5">
                {{ t("TXT_CODE_SSO_USERINFO_URL") }}
              </a-typography-title>
              <a-typography-paragraph type="secondary">
                {{ t("TXT_CODE_SSO_USERINFO_URL_DESC") }}
              </a-typography-paragraph>
              <a-input
                v-model:value="formData.ssoUserinfoUrl"
                style="max-width: 480px"
                placeholder="https://api.github.com/user"
              />
            </a-form-item>

            <a-form-item>
              <a-typography-title :level="5">
                {{ t("TXT_CODE_SSO_USER_ID_FIELD") }}
              </a-typography-title>
              <a-typography-paragraph type="secondary">
                {{ t("TXT_CODE_SSO_USER_ID_FIELD_DESC") }}
              </a-typography-paragraph>
              <a-input
                v-model:value="formData.ssoUserIdField"
                style="max-width: 320px"
                placeholder="id"
              />
            </a-form-item>

            <a-form-item>
              <a-typography-title :level="5">{{ t("TXT_CODE_SSO_SCOPES") }}</a-typography-title>
              <a-typography-paragraph type="secondary">
                {{ t("TXT_CODE_SSO_SCOPES_DESC") }}
              </a-typography-paragraph>
              <a-input
                v-model:value="formData.ssoScopes"
                style="max-width: 320px"
                placeholder="read:user"
              />
            </a-form-item>
          </template>

          <a-form-item>
            <a-typography-title :level="5">Client ID</a-typography-title>
            <a-typography-paragraph type="secondary">
              {{ t("TXT_CODE_SSO_CLIENT_ID_DESC") }}
            </a-typography-paragraph>
            <a-input
              v-model:value="formData.ssoClientId"
              style="max-width: 480px"
              :placeholder="t('TXT_CODE_4ea93630')"
            />
          </a-form-item>

          <a-form-item>
            <a-typography-title :level="5">Client Secret</a-typography-title>
            <a-typography-paragraph type="secondary">
              {{ t("TXT_CODE_SSO_CLIENT_SECRET_DESC") }}
            </a-typography-paragraph>
            <a-input-password
              v-model:value="formData.ssoClientSecret"
              style="max-width: 480px"
              :placeholder="t('TXT_CODE_4ea93630')"
            />
          </a-form-item>

          <a-form-item>
            <a-typography-title :level="5">{{ t("TXT_CODE_SSO_CALLBACK_URL") }}</a-typography-title>
            <a-typography-paragraph type="secondary">
              {{ t("TXT_CODE_SSO_CALLBACK_URL_DESC") }}
            </a-typography-paragraph>
            <a-input
              v-model:value="formData.ssoCallbackUrl"
              style="max-width: 480px"
              placeholder="https://your-panel.com/api/auth/sso/callback"
            />
          </a-form-item>

          <a-form-item>
            <a-typography-title :level="5">{{ t("TXT_CODE_SSO_ONLY_MODE") }}</a-typography-title>
            <a-typography-paragraph type="secondary">
              {{ t("TXT_CODE_SSO_ONLY_MODE_DESC") }}
            </a-typography-paragraph>
            <a-select v-model:value.prop="(formData as any).ssoOnlyMode" style="max-width: 320px">
              <a-select-option
                v-for="item in allYesNo"
                :key="String(item.value)"
                :value="item.value"
              >
                {{ item.label }}
              </a-select-option>
            </a-select>
          </a-form-item>

          <a-form-item>
            <a-typography-title :level="5">
              {{ t("TXT_CODE_SSO_AUTO_REDIRECT") }}
            </a-typography-title>
            <a-typography-paragraph type="secondary">
              {{ t("TXT_CODE_SSO_AUTO_REDIRECT_DESC") }}
            </a-typography-paragraph>
            <a-select v-model:value.prop="(formData as any).ssoAutoRedirect" style="max-width: 320px">
              <a-select-option
                v-for="item in allYesNo"
                :key="String(item.value)"
                :value="item.value"
              >
                {{ item.label }}
              </a-select-option>
            </a-select>
          </a-form-item>
        </template>

        <div class="user-plugin-config-actions">
          <a-button type="primary" :loading="saving" @click="submit">
            {{ t("TXT_CODE_abfe9512") }}
          </a-button>
        </div>
      </a-form>
    </div>
  </a-spin>
</template>

<style lang="scss" scoped>
.user-plugin-config {
  text-align: left;
}

.user-plugin-config-actions {
  margin-top: 12px;
}
</style>
