<script setup lang="ts">
import CardPanel from "@/components/CardPanel.vue";
import { router } from "@/config/router";
import { getPanelFrontendLoginActions } from "@/plugins";
import { t } from "@/lang/i18n";
import { loginPageInfo, loginUser, ssoConfig, type SsoPublicConfig } from "@/services/apis";
import { useAppStateStore } from "@/stores/useAppStateStore";
import { markdownToHTML } from "@/tools/safe";
import { reportErrorMsg } from "@/tools/validator";
import type { LayoutCard } from "@/types";
import {
  LockOutlined,
  LoginOutlined,
  UserOutlined
} from "@ant-design/icons-vue";
import { message, Modal } from "ant-design-vue";
import { computed, onMounted, reactive, ref } from "vue";

const { state: pageInfoResult, execute } = loginPageInfo();
const ssoInfo = ref<SsoPublicConfig | null>(null);

const props = defineProps<{
  card?: LayoutCard;
}>();

const formData = reactive({
  username: "",
  password: "",
  code: ""
});

const { execute: login } = loginUser();
const { updateUserInfo, isAdmin, state: appConfig } = useAppStateStore();
const loginActions = computed(() =>
  getPanelFrontendLoginActions()
    .filter((action) =>
      typeof action.condition === "function"
        ? action.condition()
        : action.condition === undefined || action.condition
    )
    .map((action) => ({
      ...action,
      title: typeof action.title === "function" ? action.title() : action.title
    }))
);

const loading = ref(false);
const is2Fa = ref(false);

const handleLogin = async () => {
  if (!formData.username.trim() || !formData.password.trim()) {
    return message.error(t("TXT_CODE_c846074d"));
  }
  if (loading.value) return;
  loading.value = true;
  try {
    const result = await login({
      data: formData
    });
    if (result.value === "NEED_2FA") {
      loading.value = false;
      is2Fa.value = true;
      return;
    }
    is2Fa.value = false;
    await handleNext();
  } catch (error: any) {
    loading.value = false;
    reportErrorMsg(error);
  }
};

const handleNext = async () => {
  try {
    await updateUserInfo();
    loginSuccess();
  } catch (error: any) {
    loading.value = false;
    console.error(error);
    Modal.error({
      title: t("TXT_CODE_da2fb99a"),
      content: t("TXT_CODE_6e718abe")
    });
  }
};

const loginSuccess = () => {
  if (isAdmin.value) {
    router.push({
      path: "/"
    });
  } else {
    router.push({ path: "/customer" });
  }
};

const openBuyInstanceDialog = async () => {
  router.push({ path: "/shop" });
};

const handleSsoLogin = () => {
  window.location.href = "/api/auth/sso/authorize";
};

onMounted(async () => {
  await execute();
  if (!appConfig.isInstall) router.push({ path: "/install" });

  try {
    const res = await ssoConfig().execute();
    if (res.value) ssoInfo.value = res.value;
  } catch {
    // SSO config may not be available
  }

  if (ssoInfo.value?.enabled && ssoInfo.value?.autoRedirect) {
    const query = router.currentRoute.value.query;
    if (!query.sso_error && query.ssoAutoRedirect !== "false") {
      handleSsoLogin();
      return;
    }
  }

  const ssoError = router.currentRoute.value.query.sso_error;
  if (ssoError) {
    const ssoErrorDesc = router.currentRoute.value.query.sso_error_desc;
    const errorCode = String(ssoError);
    const ssoErrorTitles: Record<string, string> = {
      sso_init_failed: t("TXT_CODE_SSO_ERROR_INIT_FAILED"),
      sso_auth_failed: t("TXT_CODE_SSO_ERROR_AUTH_FAILED"),
      session_expired: t("TXT_CODE_SSO_ERROR_SESSION_EXPIRED"),
      invalid_sso_session: t("TXT_CODE_SSO_ERROR_SESSION_EXPIRED"),
      sso_session_expired: t("TXT_CODE_SSO_ERROR_SESSION_EXPIRED")
    };
    Modal.error({
      title: ssoErrorTitles[errorCode] || `${t("TXT_CODE_SSO_ERROR")}: ${errorCode}`,
      content: ssoErrorDesc ? String(ssoErrorDesc) : t("TXT_CODE_SSO_CALLBACK_FAIL")
    });
  }
});
</script>

<template>
  <!-- eslint-disable vue/no-v-html -->
  <div :class="{
    'w-100': true,
    'h-100': true
  }">
    <CardPanel class="login-panel">
      <template #body>
        <div class="login-panel-body">
          <div v-if="loginActions.length" style="position: absolute; top: 24px; right: 24px; z-index: 10;">
            <template v-for="(action, index) in loginActions" :key="index">
              <a-tooltip :title="action.title">
                <a-button type="text" @click="action.click()">
                  <template #icon>
                    <component :is="action.icon" v-if="action.icon" />
                  </template>
                </a-button>
              </a-tooltip>
            </template>
          </div>
          <a-typography-title :level="3" class="mb-20 glitch-wrapper">
            <div class="glitch" :data-text="props.card?.title ? props.card?.title : t('TXT_CODE_3ba5ad')">
              {{ props.card?.title ? props.card?.title : t("TXT_CODE_3ba5ad") }}
            </div>
          </a-typography-title>
          <a-typography-paragraph class="mb-20">
            {{ t("TXT_CODE_5b60ad00") }}
          </a-typography-paragraph>
          <div class="account-input-container">
            <div v-if="ssoInfo?.enabled && ssoInfo?.onlyMode" class="sso-only-container">
              <a-typography-paragraph type="secondary" class="mb-20">
                {{ t("TXT_CODE_SSO_ONLY_MODE_WARN") }}
              </a-typography-paragraph>
              <a-button size="large" type="primary" block @click="handleSsoLogin">
                <template #icon>
                  <img v-if="ssoInfo?.iconUrl" :src="ssoInfo.iconUrl"
                    style="width: 16px; height: 16px; margin-right: 6px; vertical-align: middle" />
                  <LoginOutlined v-else />
                </template>
                {{
                  ssoInfo?.providerName
                    ? t("TXT_CODE_SSO_LOGIN_BTN", { name: ssoInfo.providerName })
                    : t("TXT_CODE_SSO_LOGIN_BTN_DEFAULT")
                }}
              </a-button>
            </div>

            <template v-else>
              <form @submit.prevent>
                <div v-if="!is2Fa">
                  <a-input v-model:value="formData.username" class="account" size="large" name="mcsm-name-input"
                    :placeholder="t('TXT_CODE_80a560a1')">
                    <template #suffix>
                      <UserOutlined style="color: rgba(0, 0, 0, 0.45)" />
                    </template>
                  </a-input>
                  <a-input v-model:value="formData.password" class="mt-20 account" type="password"
                    :placeholder="t('TXT_CODE_551b0348')" size="large" name="mcsm-pw-input" @press-enter="handleLogin">
                    <template #suffix>
                      <LockOutlined style="color: rgba(0, 0, 0, 0.45)" />
                    </template>
                  </a-input>
                </div>
                <div v-else>
                  <a-input v-model:value="formData.code" class="mt-20 mb-20 account" type="text"
                    :placeholder="t('TXT_CODE_7ac8b1d3')" size="large" autocomplete="off" name="mcsm-pw-2fa"
                    @press-enter="handleLogin">
                    <template #suffix>
                      <LockOutlined style="color: rgba(0, 0, 0, 0.45)" />
                    </template>
                  </a-input>
                </div>
              </form>

              <div class="mt-24 flex-between align-center">
                <div v-if="!appConfig.settings.businessMode" class="mcsmanager-link">
                  <div v-if="pageInfoResult?.loginInfo" class="global-markdown-html"
                    v-html="markdownToHTML(pageInfoResult?.loginInfo || '')"></div>
                  Powered by
                  <a href="https://github.com/Equestriarcadia/ElementsPanel" target="_blank" rel="noopener noreferrer">
                    ElementsPanel
                  </a>
                </div>
                <div v-else></div>
                <div class="justify-end" style="gap: 10px">
                  <a-button v-if="appConfig.settings.businessMode" size="large" class="green" style="min-width: 95px"
                    @click="openBuyInstanceDialog">
                    {{ t("TXT_CODE_5a408a5e") }}
                  </a-button>
                  <a-button size="large" type="primary" style="min-width: 95px" :loading="loading" @click="handleLogin">
                    {{ t("TXT_CODE_d2c1a316") }}
                  </a-button>
                </div>
              </div>

              <div v-if="ssoInfo?.enabled && !ssoInfo?.onlyMode" class="sso-divider-section">
                <a-divider>{{ t("TXT_CODE_SSO_LOGIN_DIVIDER") }}</a-divider>
                <a-button size="large" block @click="handleSsoLogin">
                  <template #icon>
                    <img v-if="ssoInfo?.iconUrl" :src="ssoInfo.iconUrl"
                      style="width: 16px; height: 16px; margin-right: 6px; vertical-align: middle" />
                    <LoginOutlined v-else />
                  </template>
                  {{
                    ssoInfo?.providerName
                      ? t("TXT_CODE_SSO_LOGIN_BTN", { name: ssoInfo.providerName })
                      : t("TXT_CODE_SSO_LOGIN_BTN_DEFAULT")
                  }}
                </a-button>
              </div>
            </template>
          </div>
        </div>
      </template>
    </CardPanel>
  </div>
</template>

<style lang="scss">
.account-input-container {
  input:-webkit-autofill {
    -webkit-text-fill-color: var(--color-gray-8) !important;
    -webkit-box-shadow: 0 0 0px 1000px transparent inset !important;
    background-color: transparent !important;
    background-image: none;
    transition: background-color 99999s ease-in-out 0s;
  }

  input {
    background-color: transparent;
    caret-color: #fff;
  }
}
</style>

<style lang="scss" scoped>
.login-panel {
  margin: 0 auto;
  transition: all 0.4s;
  width: 100%;
  border-radius: 12px;
  // backdrop-filter: saturate(120%) blur(12px);
  background-color: var(--login-panel-bg);

  .login-panel-body {
    position: relative;
    padding: 28px 24px;
    min-height: 322px;
  }
}

.mcsmanager-link {
  font-size: var(--font-body);
  text-align: right;
  color: var(--color-gray-7);

  a {
    color: var(--color-gray-7) !important;
    text-decoration: underline;
  }
}

.glitch-wrapper {
  position: relative;
  overflow: hidden;
}

.glitch {
  position: relative;
  font-weight: 600;

  &::before,
  &::after {
    content: attr(data-text);
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: transparent;
    overflow: hidden;
    opacity: 0;
    pointer-events: none;
  }

  &::before {
    color: #ff0040;
  }

  &::after {
    color: #00ffff;
  }
}
</style>
