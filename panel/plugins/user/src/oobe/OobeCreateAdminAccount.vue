<script setup lang="ts">
import { t } from "@/lang/i18n";
import { useAppStateStore } from "@/stores/useAppStateStore";
import { reportErrorMsg } from "@/tools/validator";
import type { FormInstance } from "ant-design-vue";
import { reactive, ref } from "vue";
import { panelInstall } from "../api";

const emit = defineEmits<{
  (e: "complete"): void;
}>();

const { updateUserInfo, updatePanelStatus } = useAppStateStore();
const formRef = ref<FormInstance>();
const formData = reactive({
  username: "",
  password: ""
});

const { execute: createAdminUser } = panelInstall();
const installLoading = ref(false);

const createUser = async () => {
  try {
    installLoading.value = true;
    await formRef.value?.validate();
    await createAdminUser({
      data: formData
    });
    await updatePanelStatus();
    await updateUserInfo();
    emit("complete");
  } catch (err: any) {
    err.errorFields?.forEach((field: any) => {
      field?.errors?.forEach((error: any) => {
        reportErrorMsg(error);
      });
    });
  } finally {
    installLoading.value = false;
  }
};
</script>

<template>
  <a-typography>
    <a-typography-title :level="3">
      {{ t("TXT_CODE_f880b5ad") }}
    </a-typography-title>
    <a-typography-paragraph>
      <a-typography-text>
        {{ t("TXT_CODE_3a056dc8") }}
      </a-typography-text>
    </a-typography-paragraph>
  </a-typography>
  <a-form ref="formRef" :model="formData" :label-col="{ span: 4 }" autocomplete="off">
    <a-form-item
      name="username"
      :rules="[{ required: true, message: t('TXT_CODE_2695488c') }]"
    >
      <a-input
        v-model:value="formData.username"
        autocomplete="off"
        :placeholder="t('TXT_CODE_eb9fcdad')"
      />
    </a-form-item>

    <a-form-item
      name="password"
      :rules="[
        {
          required: true,
          pattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{9,36}$/,
          message: t('TXT_CODE_ad533c70')
        }
      ]"
    >
      <a-input-password
        v-model:value="formData.password"
        autocomplete="off"
        :placeholder="t('TXT_CODE_551b0348')"
      />
    </a-form-item>

    <a-form-item :wrapper-col="{ span: 16 }">
      <a-button :loading="installLoading" type="primary" @click="createUser">
        {{ t("TXT_CODE_11d5caea") }}
      </a-button>
    </a-form-item>
  </a-form>
</template>
