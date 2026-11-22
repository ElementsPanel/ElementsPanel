<script setup lang="ts">
import { PERMISSION_MAP } from "@elementspanel/epanel-plugin-console/config/const";
import { t } from "@elementspanel/epanel-plugin-i18n";
import {
  confirm2FA,
  setUserApiKey,
  updatePassword
} from "@elementspanel/epanel-plugin-console/services/apis/user";
import { useAppStateStore } from "@elementspanel/epanel-plugin-console/stores/useAppStateStore";
import { useAppToolsStore } from "@elementspanel/epanel-plugin-console/stores/useAppToolsStore";
import { toCopy } from "@elementspanel/epanel-plugin-console/tools/copy";
import { reportErrorMsg } from "@elementspanel/epanel-plugin-console/tools/validator";
import { message } from "@elementspanel/epanel-plugin-console/tools/vuetifyToast";
import { reactive, ref } from "vue";
import {
  VBtn,
  VCard,
  VCardActions,
  VCardText,
  VChip,
  VCol,
  VDialog,
  VForm,
  VImg,
  VRow,
  VSpacer,
  VTextField
} from "vuetify/components";
import { bind2FA } from "../api";

const { state, updateUserInfo } = useAppStateStore();
const { state: tools } = useAppToolsStore();
const { execute, isLoading: setUserApiKeyLoading } = setUserApiKey();
const { execute: executeUpdatePassword, isLoading: updatePasswordLoading } = updatePassword();

const formState = reactive({
  resetPassword: false,
  TOTPCode: "",
  password1: "",
  password2: "",
  qrcode: ""
});
const disableApiKeyDialog = ref(false);

const close = () => {
  tools.showUserInfoDialog = false;
};

const handleGenerateApiKey = async (enable: boolean) => {
  await execute({ data: { enable }, forceRequest: true, errorAlert: true });
  disableApiKeyDialog.value = false;
  await updateUserInfo();
  return message.success(t("TXT_CODE_COMMON_UPDATE_SUCCESSFUL"));
};

const handleChangePassword = async () => {
  if (!formState.password1 || !formState.password2)
    return message.error(t("TXT_CODE_COMMON_PLEASE_COMPLETE_YOUR_ACCOUNT_PROFILE"));
  if (formState.password1 !== formState.password2)
    return reportErrorMsg(t("TXT_CODE_COMMON_PASSWORD_LENGTH_DOES_NOT_MATCH"));
  if (formState.password1.length < 9 || formState.password1.length > 36)
    return reportErrorMsg(t("TXT_CODE_COMMON_PASSWORD_LENGTH_CANNOT_BE_LESS_THAN_9_CHARACTERS"));
  try {
    await executeUpdatePassword({ data: { passWord: formState.password1 } });
    message.success(t("TXT_CODE_COMMON_UPDATE_SUCCESSFUL"));
    setTimeout(() => window.location.reload(), 600);
  } catch (error: any) {
    return reportErrorMsg(error.message);
  }
};

const handleBind2FA = async () => {
  const qrcode = await bind2FA().execute({ data: {} });
  if (qrcode.value) {
    formState.qrcode = String(qrcode.value);
    await updateUserInfo();
  }
};

const confirm2FACode = async () => {
  try {
    await confirm2FA().execute({ data: { enable: true, TOTPCode: formState.TOTPCode } });
  } catch {
    return message.error(t("TXT_CODE_COMMON_TWO_FACTOR_AUTHENTICATION_CODE_IS_INCORRECT"));
  }
  message.success(t("TXT_CODE_COMMON_UPDATE_SUCCESSFUL"));
  await updateUserInfo();
  formState.TOTPCode = "";
  formState.qrcode = "";
};

const disable2FACode = async () => {
  await confirm2FA().execute({ data: { enable: false, TOTPCode: "000000" } });
  message.success(t("TXT_CODE_COMMON_UPDATE_SUCCESSFUL"));
  await updateUserInfo();
  formState.qrcode = "";
};
</script>

<template>
  <VDialog
    v-model="tools.showUserInfoDialog"
    class="app-dialog myself-info-dialog"
    max-width="720"
    scrollable
  >
    <VCard :title="t('TXT_CODE_COMMON_USER_PROFILE')">
      <VCardText>
        <VForm>
          <VRow>
            <VCol cols="12" sm="6">
              <VTextField
                :label="t('TXT_CODE_USER_USERNAME')"
                :model-value="state.userInfo?.userName"
                readonly
              />
            </VCol>
            <VCol cols="12" sm="6">
              <VTextField
                :label="t('TXT_CODE_USER_PERMISSION_LEVEL')"
                :model-value="PERMISSION_MAP[String(state.userInfo?.permission)]"
                readonly
              />
            </VCol>
            <VCol cols="12" sm="6">
              <VTextField
                :label="t('TXT_CODE_COMMON_REGISTRATION_TIME')"
                :model-value="state.userInfo?.registerTime"
                readonly
              />
            </VCol>
            <VCol cols="12" sm="6">
              <VTextField
                :label="t('TXT_CODE_COMMON_LAST_LOGIN')"
                :model-value="state.userInfo?.loginTime"
                readonly
              />
            </VCol>
            <VCol cols="12">
              <VTextField
                :label="t('TXT_CODE_COMMON_UUID')"
                :model-value="state.userInfo?.uuid"
                readonly
              />
            </VCol>
          </VRow>

          <section class="profile-section">
            <h3>{{ t("TXT_CODE_COMMON_PASSWORD") }}</h3>
            <VBtn
              v-if="!formState.resetPassword"
              color="error"
              variant="tonal"
              @click="formState.resetPassword = true"
            >
              {{ t("TXT_CODE_COMMON_CHANGE") }}</VBtn
            >
            <div v-else class="profile-form-stack">
              <VTextField
                v-model="formState.password1"
                type="password"
                :placeholder="t('TXT_CODE_COMMON_PLEASE_ENTER_NEW_PASSWORD')"
              />
              <VTextField
                v-model="formState.password2"
                type="password"
                :placeholder="t('TXT_CODE_COMMON_PLEASE_RE_ENTER_THE_NEW_PASSWORD')"
              />
              <div class="profile-actions">
                <VBtn variant="text" @click="formState.resetPassword = false">{{
                  t("TXT_CODE_COMMON_DISCARD")
                }}</VBtn>
                <VBtn
                  color="primary"
                  :loading="updatePasswordLoading"
                  @click="handleChangePassword"
                  >{{ t("TXT_CODE_COMMON_CONFIRM") }}</VBtn
                >
              </div>
            </div>
          </section>

          <section class="profile-section">
            <h3>{{ t("TXT_CODE_COMMON_TWO_FACTOR_AUTHENTICATION") }}</h3>
            <div v-if="!formState.qrcode" class="profile-actions">
              <VBtn @click="handleBind2FA">{{
                state.userInfo?.open2FA
                  ? t("TXT_CODE_COMMON_REBIND")
                  : t("TXT_CODE_COMMON_START_BINDING")
              }}</VBtn>
              <VBtn
                v-if="state.userInfo?.open2FA"
                color="error"
                variant="tonal"
                @click="disable2FACode"
                >{{ t("TXT_CODE_USER_ACCOUNT_DISABLE") }}</VBtn
              >
            </div>
            <div v-else class="two-fa-setup">
              <p>
                1.
                {{
                  t(
                    "TXT_CODE_COMMON_SCAN_THE_QR_CODE_USING_GOOGLE_AUTHENTICATION_OR_OTHER_UNIVERSAL_2_FA_TOOLS"
                  )
                }}<br />2.
                {{ t("TXT_CODE_COMMON_ENTER_THE_TOTP_VERIFICATION_CODE_IN_THE_BOX_BELOW") }}<br />3.
                {{ t("TXT_CODE_COMMON_CLICK_THE_I_HAVE_SCANNED_BUTTON") }}
              </p>
              <VImg
                :src="formState.qrcode"
                :alt="t('TXT_CODE_UI_2_FA_QR_CODE')"
                width="180"
                height="180"
                class="qrcode"
              />
              <VTextField
                v-model="formState.TOTPCode"
                :placeholder="t('TXT_CODE_COMMON_PLEASE_ENTER_THE_TWO_FACTOR_AUTHENTICATION_CODE')"
              />
              <div class="profile-actions">
                <VBtn color="primary" :loading="setUserApiKeyLoading" @click="confirm2FACode">{{
                  t("TXT_CODE_COMMON_I_HAVE_SCANNED")
                }}</VBtn>
                <VBtn variant="text" @click="formState.qrcode = ''">{{
                  t("TXT_CODE_COMMON_DISCARD")
                }}</VBtn>
              </div>
            </div>
          </section>

          <section class="profile-section">
            <h3>{{ t("TXT_CODE_UI_API_KEY") }}</h3>
            <p class="text-medium-emphasis">
              {{
                t(
                  "TXT_CODE_COMMON_REQUESTS_USING_THIS_KEY_HAVE_THE_SAME_PERMISSIONS_AS_THIS_ACCOUNT"
                )
              }}
            </p>
            <div class="api-key-display">
              <VChip v-if="state.userInfo?.apiKey" class="api-key-chip" variant="tonal"
                >{{ state.userInfo.apiKey }}
              </VChip>
              <span v-else class="text-medium-emphasis">{{ t("TXT_CODE_COMMON_DISABLED") }}</span>
              <VBtn
                v-if="state.userInfo?.apiKey"
                icon="mdi-content-copy"
                size="small"
                variant="text"
                :aria-label="t('TXT_CODE_COMMON_COPY')"
                @click="toCopy(String(state.userInfo?.apiKey ?? ''))"
              />
            </div>
            <div class="profile-actions">
              <VBtn
                color="primary"
                :loading="setUserApiKeyLoading"
                @click="handleGenerateApiKey(true)"
                >{{ t("TXT_CODE_COMMON_GENERATE_NEW_KEY") }}</VBtn
              >
              <VBtn
                v-if="state.userInfo?.apiKey"
                color="error"
                variant="tonal"
                @click="disableApiKeyDialog = true"
                >{{ t("TXT_CODE_COMMON_DISABLE") }}</VBtn
              >
            </div>
          </section>
        </VForm>
      </VCardText>
      <VCardActions>
        <VSpacer />
        <VBtn variant="text" @click="close">{{ t("TXT_CODE_COMMON_STOP") }}</VBtn>
      </VCardActions>
    </VCard>
  </VDialog>

  <VDialog v-model="disableApiKeyDialog" class="app-dialog" max-width="460" scrollable>
    <VCard :title="t('TXT_CODE_USER_DISABLE_API_KEY')" rounded="xl">
      <VCardText>{{
        t("TXT_CODE_COMMON_DISABLING_THIS_KEY_PREVENTS_IT_FROM_AUTHENTICATING_REQUESTS")
      }}</VCardText>
      <VCardActions>
        <VSpacer />
        <VBtn variant="text" @click="disableApiKeyDialog = false">{{
          t("TXT_CODE_COMMON_CANCEL")
        }}</VBtn>
        <VBtn color="error" :loading="setUserApiKeyLoading" @click="handleGenerateApiKey(false)">{{
          t("TXT_CODE_COMMON_DISABLE")
        }}</VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<style scoped lang="scss">
.profile-section {
  margin-top: 16px;
  padding: 16px;
  border-radius: 20px;
  background: rgba(var(--v-theme-on-surface), 0.035);
}

.profile-section h3 {
  margin: 0 0 12px;
  color: var(--text-color);
  font-size: 15px;
}

.profile-form-stack,
.two-fa-setup {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.profile-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.qrcode {
  align-self: flex-start;
  border-radius: 8px;
}

.api-key-display {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.api-key-chip {
  max-width: 100%;
  overflow: hidden;
  font-family: monospace;
}

.api-key-chip :deep(.v-chip__content) {
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
