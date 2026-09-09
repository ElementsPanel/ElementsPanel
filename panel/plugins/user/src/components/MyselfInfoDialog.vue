<script setup lang="ts">
import { PERMISSION_MAP } from "@/config/const";
import { t } from "@/lang/i18n";
import { confirm2FA, setUserApiKey, updatePassword } from "@/services/apis/user";
import { useAppStateStore } from "@/stores/useAppStateStore";
import { useAppToolsStore } from "@/stores/useAppToolsStore";
import { toCopy } from "@/tools/copy";
import { reportErrorMsg } from "@/tools/validator";
import { message } from "ant-design-vue";
import { reactive, ref } from "vue";
import {
  VBtn,
  VCard,
  VCardActions,
  VCardText,
  VCardTitle,
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
  return message.success(t("TXT_CODE_d3de39b4"));
};

const handleChangePassword = async () => {
  if (!formState.password1 || !formState.password2) return message.error(t("TXT_CODE_c846074d"));
  if (formState.password1 !== formState.password2) return reportErrorMsg(t("TXT_CODE_d51f5d6"));
  if (formState.password1.length < 9 || formState.password1.length > 36)
    return reportErrorMsg(t("TXT_CODE_cc5a3aea"));
  try {
    await executeUpdatePassword({ data: { passWord: formState.password1 } });
    message.success(t("TXT_CODE_d3de39b4"));
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
    return message.error(t("TXT_CODE_3d68e43b"));
  }
  message.success(t("TXT_CODE_d3de39b4"));
  await updateUserInfo();
  formState.TOTPCode = "";
  formState.qrcode = "";
};

const disable2FACode = async () => {
  await confirm2FA().execute({ data: { enable: false, TOTPCode: "000000" } });
  message.success(t("TXT_CODE_d3de39b4"));
  await updateUserInfo();
  formState.qrcode = "";
};
</script>

<template>
  <VDialog v-model="tools.showUserInfoDialog" class="app-dialog myself-info-dialog" max-width="720" scrollable>
    <VCard rounded="xl" :title="t('TXT_CODE_9bb2f08b')">
      <VCardText>
        <VForm>
          <VRow>
            <VCol cols="12" sm="6">
              <VTextField :label="t('TXT_CODE_eb9fcdad')" :model-value="state.userInfo?.userName" readonly />
            </VCol>
            <VCol cols="12" sm="6">
              <VTextField :label="t('TXT_CODE_63ccbf90')"
                :model-value="PERMISSION_MAP[String(state.userInfo?.permission)]" readonly />
            </VCol>
            <VCol cols="12" sm="6">
              <VTextField :label="t('TXT_CODE_c5c56801')" :model-value="state.userInfo?.registerTime" readonly />
            </VCol>
            <VCol cols="12" sm="6">
              <VTextField :label="t('TXT_CODE_d7ee9ba')" :model-value="state.userInfo?.loginTime" readonly />
            </VCol>
            <VCol cols="12">
              <VTextField :label="t('TXT_CODE_1d9d0746')" :model-value="state.userInfo?.uuid" readonly />
            </VCol>
          </VRow>

          <section class="profile-section">
            <h3>{{ t("TXT_CODE_551b0348") }}</h3>
            <VBtn v-if="!formState.resetPassword" color="error" variant="tonal" @click="formState.resetPassword = true">
              {{ t("TXT_CODE_50d471b2") }}</VBtn>
            <div v-else class="profile-form-stack">
              <VTextField v-model="formState.password1" type="password" :placeholder="t('TXT_CODE_4f6c39d3')" />
              <VTextField v-model="formState.password2" type="password" :placeholder="t('TXT_CODE_37924654')" />
              <div class="profile-actions">
                <VBtn variant="text" @click="formState.resetPassword = false">{{ t("TXT_CODE_3b1cc020") }}</VBtn>
                <VBtn color="primary" :loading="updatePasswordLoading" @click="handleChangePassword">{{
                  t("TXT_CODE_d507abff") }}</VBtn>
              </div>
            </div>
          </section>

          <section class="profile-section">
            <h3>{{ t("TXT_CODE_61eae8a6") }}</h3>
            <div v-if="!formState.qrcode" class="profile-actions">
              <VBtn @click="handleBind2FA">{{ state.userInfo?.open2FA ? t("TXT_CODE_85a33a84") : t("TXT_CODE_a492ae63")
                }}</VBtn>
              <VBtn v-if="state.userInfo?.open2FA" color="error" variant="tonal" @click="disable2FACode">{{
                t("TXT_CODE_edd64e4d") }}</VBtn>
            </div>
            <div v-else class="two-fa-setup">
              <p>1. {{ t("TXT_CODE_cc561947") }}<br />2. {{ t("TXT_CODE_fffce4a8") }}<br />3. {{ t("TXT_CODE_af2a6972")
                }}</p>
              <VImg :src="formState.qrcode" width="180" height="180" class="qrcode" />
              <VTextField v-model="formState.TOTPCode" :placeholder="t('TXT_CODE_7ac8b1d3')" />
              <div class="profile-actions">
                <VBtn color="primary" :loading="setUserApiKeyLoading" @click="confirm2FACode">{{ t("TXT_CODE_b0a18c20")
                  }}</VBtn>
                <VBtn variant="text" @click="formState.qrcode = ''">{{ t("TXT_CODE_3b1cc020") }}</VBtn>
              </div>
            </div>
          </section>

          <section class="profile-section">
            <h3>APIKEY</h3>
            <p class="text-medium-emphasis">{{ t("TXT_CODE_b2dbf778") }}</p>
            <div class="api-key-display">
              <VChip v-if="state.userInfo?.apiKey" class="api-key-chip" variant="tonal">{{ state.userInfo.apiKey }}
              </VChip>
              <span v-else class="text-medium-emphasis">{{ t("TXT_CODE_d7dbc7c2") }}</span>
              <VBtn v-if="state.userInfo?.apiKey" icon="mdi-content-copy" size="small" variant="text"
                :aria-label="t('TXT_CODE_13ae6a93')" @click="toCopy(String(state.userInfo?.apiKey ?? ''))" />
            </div>
            <div class="profile-actions">
              <VBtn color="primary" :loading="setUserApiKeyLoading" @click="handleGenerateApiKey(true)">{{
                t("TXT_CODE_d51cd7ae") }}</VBtn>
              <VBtn v-if="state.userInfo?.apiKey" color="error" variant="tonal" @click="disableApiKeyDialog = true">{{
                t("TXT_CODE_718c9310") }}</VBtn>
            </div>
          </section>
        </VForm>
      </VCardText>
      <VCardActions>
        <VSpacer />
        <VBtn variant="text" @click="close">{{ t("TXT_CODE_b1dedda3") }}</VBtn>
      </VCardActions>
    </VCard>
  </VDialog>

  <VDialog v-model="disableApiKeyDialog" class="app-dialog" max-width="460" scrollable>
    <VCard rounded="xl">
      <VCardTitle>{{ t("TXT_CODE_718c9310") }}</VCardTitle>
      <VCardText>{{ t("TXT_CODE_6819de18") }}</VCardText>
      <VCardActions>
        <VSpacer />
        <VBtn variant="text" @click="disableApiKeyDialog = false">{{ t("TXT_CODE_a0451c97") }}</VBtn>
        <VBtn color="error" :loading="setUserApiKeyLoading" @click="handleGenerateApiKey(false)">{{
          t("TXT_CODE_718c9310") }}</VBtn>
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
