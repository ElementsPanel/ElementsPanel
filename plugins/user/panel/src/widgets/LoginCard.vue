<script setup lang="ts">
import { t } from "@elementspanel/epanel-plugin-i18n";
import { markdownToHTML } from "@elementspanel/epanel-plugin-console/tools/safe";
import {
  VAlert,
  VBtn,
  VCard,
  VCardText,
  VDivider,
  VForm,
  VTextField,
  VTooltip
} from "vuetify/components";
import { useLogin } from "../hooks/useLogin";

const {
  pageInfoResult,
  ssoInfo,
  formData,
  loginActions,
  loading,
  is2Fa,
  handleLogin,
  handleSsoLogin
} = useLogin();
</script>

<template>
  <!-- eslint-disable vue/no-v-html -->
  <div class="login-card-host">
    <VAlert v-if="pageInfoResult?.isFirstStartup" class="mb-1" type="info" variant="tonal">
      {{ t("TXT_CODE_FIRST_STARTUP_NOTICE") }}
    </VAlert>
    <VCard class="login-panel" data-app-surface="card" elevation="0" rounded="xl">
      <VCardText class="login-panel-body">
        <div v-if="loginActions.length" class="login-actions">
          <VTooltip
            v-for="(action, index) in loginActions"
            :key="index"
            :text="action.title"
            location="bottom"
          >
            <template #activator="{ props: tooltipProps }">
              <VBtn
                v-bind="tooltipProps"
                :aria-label="action.title"
                icon
                variant="text"
                @click="action.click()"
              >
                <component :is="action.icon" v-if="action.icon" />
              </VBtn>
            </template>
          </VTooltip>
        </div>
        <h2 class="login-title glitch-wrapper">
          <div class="glitch" :data-text="t('TXT_CODE_LOGIN_AUTHENTICATION_TITLE')">
            {{ t("TXT_CODE_LOGIN_AUTHENTICATION_TITLE") }}
          </div>
        </h2>
        <p class="login-subtitle">
          {{ t("TXT_CODE_COMMON_LOGIN_TO_ELEMENTS_PANEL_CONTROL_PANEL") }}
        </p>
        <div class="account-input-container">
          <div v-if="ssoInfo?.enabled && ssoInfo?.onlyMode" class="sso-only-container">
            <VAlert class="mb-5" type="info" variant="tonal">
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
                  :placeholder="t('TXT_CODE_LOGIN_ACCOUNT_NAME')"
                  prepend-inner-icon="mdi-account"
                  density="comfortable"
                  hide-details
                />
                <VTextField
                  v-model="formData.password"
                  class="mt-5 account"
                  type="password"
                  name="mcsm-pw-input"
                  autocomplete="current-password"
                  :placeholder="t('TXT_CODE_COMMON_PASSWORD')"
                  prepend-inner-icon="mdi-lock"
                  density="comfortable"
                  hide-details
                />
              </div>
              <VTextField
                v-else
                v-model="formData.code"
                class="mt-5 mb-5 account"
                type="text"
                name="mcsm-pw-2fa"
                autocomplete="one-time-code"
                :placeholder="t('TXT_CODE_COMMON_PLEASE_ENTER_THE_TWO_FACTOR_AUTHENTICATION_CODE')"
                prepend-inner-icon="mdi-lock-check"
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
                  {{ t("TXT_CODE_LOGIN_SUBMIT") }}
                </VBtn>
              </div>
            </VForm>

            <div v-if="ssoInfo?.enabled && !ssoInfo?.onlyMode" class="sso-divider-section">
              <div class="sso-divider">
                <VDivider />
                <span>{{ t("TXT_CODE_SSO_LOGIN_DIVIDER") }}</span>
                <VDivider />
              </div>
              <VBtn size="large" block variant="flat" @click="handleSsoLogin">
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
  overflow: hidden;
  background-color: var(--login-panel-bg);
  color: var(--text-color);

  .login-panel-body {
    position: relative;
    padding: 32px;
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

@media (max-width: 480px) {
  .login-panel .login-panel-body {
    padding: 24px;
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
