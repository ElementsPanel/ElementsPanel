<script setup lang="ts">
import { openNodeSelectDialog } from "@/components/fc/index";
import CardPanel from "@/components/CardPanel.vue";
import { router } from "@/config/router";
import { QUICKSTART_METHOD } from "@/hooks/widgets/quickStartFlow";
import { t } from "@/lang/i18n";
import InstallOptionButton from "@/widgets/market/InstallOptionButton.vue";
import CreateInstanceForm from "@/widgets/setupApp/CreateInstanceForm.vue";
import {
  AppstoreAddOutlined,
  BlockOutlined,
  FileZipOutlined,
  FolderOpenOutlined
} from "@ant-design/icons-vue";
import { ref } from "vue";

const formData = ref({
  createMethod: QUICKSTART_METHOD.DOCKER,
  daemonId: ""
});
const showCreateForm = ref(false);

const handleNext = (instanceUuid: string) => {
  showCreateForm.value = false;
  router.push({
    path: "/instances/terminal",
    query: {
      daemonId: formData.value.daemonId,
      instanceId: instanceUuid
    }
  });
};

const handleInstallAction = async (createMethod: QUICKSTART_METHOD) => {
  formData.value.createMethod = createMethod;

  try {
    const selectedNode = await openNodeSelectDialog();
    if (!selectedNode) return;
    formData.value.daemonId = selectedNode.uuid;
    showCreateForm.value = true;
  } catch (error) {
    console.error(error);
  }
};

const manualInstallOptions = [
  {
    label: t("TXT_CODE_a3efb1cc"),
    icon: FileZipOutlined,
    description: t("TXT_CODE_f09da050"),
    action: (e: Event) => {
      handleInstallAction(QUICKSTART_METHOD.IMPORT);
      e.preventDefault();
    }
  },
  {
    label: t("TXT_CODE_bae487e4"),
    icon: BlockOutlined,
    description: t("TXT_CODE_256e5825"),
    action: (e: Event) => {
      handleInstallAction(QUICKSTART_METHOD.DOCKER);
      e.preventDefault();
    }
  },
  {
    label: t("TXT_CODE_e0fca76"),
    icon: FolderOpenOutlined,
    description: t("TXT_CODE_b3844cf8"),
    action: (e: Event) => {
      handleInstallAction(QUICKSTART_METHOD.EXIST);
      e.preventDefault();
    }
  }
];
</script>

<template>
  <main class="create-instance-page">
    <CardPanel :full-height="false">
      <template #title>
        <span><AppstoreAddOutlined /> {{ t("TXT_CODE_5a74975b") }}</span>
      </template>
      <template #body>
        <a-typography-paragraph>
          <span class="page-description">{{ t("TXT_CODE_81ad9e80") }}</span>
        </a-typography-paragraph>
        <div class="manual-install-options">
          <a-row :gutter="[16, 16]">
            <a-col
              v-for="(option, index) in manualInstallOptions"
              :key="index"
              :span="24"
              :md="12"
              :lg="8"
            >
              <InstallOptionButton :option="option" />
            </a-col>
          </a-row>
        </div>
      </template>
    </CardPanel>

    <a-modal
      v-model:open="showCreateForm"
      :title="t('TXT_CODE_645bc545')"
      :width="1000"
      :footer="null"
      :destroy-on-close="true"
    >
      <CreateInstanceForm
        :create-method="formData.createMethod"
        :daemon-id="formData.daemonId"
        @next-step="handleNext"
      />
    </a-modal>
  </main>
</template>

<style lang="scss" scoped>
.create-instance-page {
  box-sizing: border-box;
  width: 100%;
  max-width: var(--app-max-width);
  margin: 0 auto;
  padding: 0 24px 20px;
}

.page-description {
  opacity: 0.6;
}

.manual-install-options {
  margin: 24px auto 8px;
}

@media (max-width: 992px) {
  .create-instance-page {
    padding: 0 12px 80px;
  }
}
</style>
