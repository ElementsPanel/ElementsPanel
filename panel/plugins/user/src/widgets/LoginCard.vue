<script setup lang="ts">
import { router } from "@/config/router";
import { t } from "@/lang/i18n";
import { ctx } from "@/plugin/context";
import { loginPageInfo, loginUser, ssoConfig, type SsoPublicConfig } from "@/services/apis";
import { useAppStateStore } from "@/stores/useAppStateStore";
import { sleep } from "@/tools/common";
import { markdownToHTML } from "@/tools/safe";
import { reportErrorMsg } from "@/tools/validator";
import type { LayoutCard } from "@/types";
import { message, Modal } from "ant-design-vue";
import { computed, onMounted, reactive, ref } from "vue";
import {
  VAlert,
  VBtn,
  VCard,
  VCardText,
  VDivider,
  VForm,
  VTextField
} from "vuetify/lib/components/index.mjs";

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
const { updateUserInfo, isAdmin } = useAppStateStore();
const loginActions = computed(() =>
  ctx.menus.loginActions
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
// Fade the card out before navigating away after a successful login
const fadeOut = ref(false);

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
    await loginSuccess();
  } catch (error: any) {
    loading.value = false;
    console.error(error);
    Modal.error({
      title: t("TXT_CODE_da2fb99a"),
      content: t("TXT_CODE_6e718abe")
    });
  }
};

const loginSuccess = async () => {
  fadeOut.value = true;
  await sleep(420);
  if (isAdmin.value) {
    router.push({
      path: "/"
    });
  } else {
    router.push({ path: "/customer" });
  }
};

const handleSsoLogin = () => {
  window.location.href = "/api/auth/sso/authorize";
};

onMounted(async () => {
  await execute();

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
  <div class="login-card-host">
    <VCard class="login-panel" :class="{ 'login-card-fading': fadeOut }" elevation="0">
      <VCardText class="login-panel-body">
        <div v-if="loginActions.length" class="login-actions">
          <template v-for="(action, index) in loginActions" :key="index">
            <VBtn
              :aria-label="action.title"
              :title="action.title"
              icon
              variant="text"
              @click="action.click()"
            >
              <component :is="action.icon" v-if="action.icon" />
            </VBtn>
          </template>
        </div>
        <h2 class="login-title glitch-wrapper">
          <div class="glitch" :data-text="props.card?.title ? props.card?.title : t('TXT_CODE_3ba5ad')">
            {{ props.card?.title ? props.card?.title : t("TXT_CODE_3ba5ad") }}
          </div>
        </h2>
        <p class="login-subtitle">
          {{ t("TXT_CODE_5b60ad00") }}
        </p>
        <div class="account-input-container">
          <div v-if="ssoInfo?.enabled && ssoInfo?.onlyMode" class="sso-only-container">
            <VAlert class="mb-20" type="info" variant="tonal">
              {{ t("TXT_CODE_SSO_ONLY_MODE_WARN") }}
            </VAlert>
            <VBtn size="large" color="primary" block @click="handleSsoLogin">
              <template #prepend>
                <img v-if="ssoInfo?.iconUrl" :src="ssoInfo.iconUrl" class="sso-icon" alt="" />
                <span v-else class="mdi mdi-login" aria-hidden="true"></span>
              </template>
              {{
                ssoInfo?.providerName
                  ? t("TXT_CODE_SSO_LOGIN_BTN", { name: ssoInfo.providerName })
                  : t("TXT_CODE_SSO_LOGIN_BTN_DEFAULT")
              }}
            </VBtn>
          </div>

          <template v-else>
            <VForm @submit.prevent="handleLogin">
              <div v-if="!is2Fa">
                <VTextField
                  v-model="formData.username"
                  class="account"
                  name="mcsm-name-input"
                  autocomplete="username"
                  :placeholder="t('TXT_CODE_80a560a1')"
                  prepend-inner-icon="mdi-account"
                  variant="outlined"
                  density="comfortable"
                  hide-details
                />
                <VTextField
                  v-model="formData.password"
                  class="mt-20 account"
                  type="password"
                  name="mcsm-pw-input"
                  autocomplete="current-password"
                  :placeholder="t('TXT_CODE_551b0348')"
                  prepend-inner-icon="mdi-lock"
                  variant="outlined"
                  density="comfortable"
                  hide-details
                />
              </div>
              <VTextField
                v-else
                v-model="formData.code"
                class="mt-20 mb-20 account"
                type="text"
                name="mcsm-pw-2fa"
                autocomplete="one-time-code"
                :placeholder="t('TXT_CODE_7ac8b1d3')"
                prepend-inner-icon="mdi-lock-check"
                variant="outlined"
                density="comfortable"
                hide-details
              />
              <div class="login-actions-row">
                <div class="mcsmanager-link">
                  <div
                    v-if="pageInfoResult?.loginInfo"
                    class="global-markdown-html"
                    v-html="markdownToHTML(pageInfoResult?.loginInfo || '')"
                  ></div>
                  Powered by
                  <a
                    href="https://github.com/ElementsPanel/ElementsPanel"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    ElementsPanel
                  </a>
                </div>
                <VBtn size="large" color="primary" type="submit" :loading="loading" min-width="95">
                  {{ t("TXT_CODE_d2c1a316") }}
                </VBtn>
              </div>
            </VForm>

            <div v-if="ssoInfo?.enabled && !ssoInfo?.onlyMode" class="sso-divider-section">
              <div class="sso-divider">
                <VDivider />
                <span>{{ t("TXT_CODE_SSO_LOGIN_DIVIDER") }}</span>
                <VDivider />
              </div>
              <VBtn size="large" block variant="outlined" @click="handleSsoLogin">
                <template #prepend>
                  <img v-if="ssoInfo?.iconUrl" :src="ssoInfo.iconUrl" class="sso-icon" alt="" />
                  <span v-else class="mdi mdi-login" aria-hidden="true"></span>
                </template>
                {{
                  ssoInfo?.providerName
                    ? t("TXT_CODE_SSO_LOGIN_BTN", { name: ssoInfo.providerName })
                    : t("TXT_CODE_SSO_LOGIN_BTN_DEFAULT")
                }}
              </VBtn>
            </div>
          </template>
        </div>
      </VCardText>
    </VCard>
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
  height: 100%;
  border-radius: 12px;
  overflow: hidden;
  // backdrop-filter: saturate(120%) blur(12px);
  background-color: var(--login-panel-bg);
  color: var(--text-color);

  .login-panel-body {
    position: relative;
    padding: 28px 24px;
    min-height: 322px;
  }
}

.login-card-host {
  width: 100%;
  height: 100%;
}

.login-actions {
  position: absolute;
  top: 18px;
  right: 18px;
  z-index: 10;
}

.login-title {
  margin: 0 0 20px;
  font-size: 22px;
  line-height: 1.35;
  font-weight: 600;
}

.login-subtitle {
  margin: 0 0 20px;
  color: var(--text-color);
}

.login-actions-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-top: 24px;
}

.sso-divider {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 20px 0;
  color: var(--text-color);
  font-size: var(--font-body);

  .v-divider {
    flex: 1;
  }
}

.sso-icon {
  width: 16px;
  height: 16px;
  object-fit: contain;
}

.login-card-fading {
  opacity: 0;
  pointer-events: none;
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
