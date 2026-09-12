<script setup lang="ts">
import { router } from "@/config/router";
import { t } from "@/lang/i18n";
import { remoteNodeList } from "@/services/apis";
import type { NodeStatus } from "@/types";
import { QUICKSTART_METHOD } from "@/hooks/widgets/quickStartFlow";
import CreateInstanceForm from "../widgets/setupApp/CreateInstanceForm.vue";
import { computed, ref } from "vue";
import {
  VAlert,
  VBtn,
  VCard,
  VCardText,
  VChip,
  VCol,
  VContainer,
  VDivider,
  VIcon,
  VProgressLinear,
  VRow,
  VStepper,
  VStepperHeader,
  VStepperItem,
  VStepperWindow,
  VStepperWindowItem
} from "vuetify/components";

const props = defineProps<{
  embedded?: boolean;
}>();

const emit = defineEmits<{
  (event: "created", instanceUuid: string): void;
}>();

const step = ref(1);
const createMethod = ref<QUICKSTART_METHOD | "">("");
const daemonId = ref("");
const selectedNode = ref<NodeStatus>();
const { execute: loadNodes, state: nodes, isLoading: nodesLoading } = remoteNodeList();

const availableNodes = computed(() => (nodes.value || []).filter((node) => node.available));
const methodOptions = [
  {
    value: QUICKSTART_METHOD.IMPORT,
    title: t("TXT_CODE_a3efb1cc"),
    description: t("TXT_CODE_f09da050"),
    icon: "mdi-folder-zip-outline"
  },
  {
    value: QUICKSTART_METHOD.DOCKER,
    title: t("TXT_CODE_bae487e4"),
    description: t("TXT_CODE_256e5825"),
    icon: "mdi-docker"
  },
  {
    value: QUICKSTART_METHOD.EXIST,
    title: t("TXT_CODE_e0fca76"),
    description: t("TXT_CODE_b3844cf8"),
    icon: "mdi-folder-open-outline"
  }
];

const chooseMethod = async (method: QUICKSTART_METHOD) => {
  createMethod.value = method;
  daemonId.value = "";
  selectedNode.value = undefined;
  step.value = 2;
  if (!nodes.value) {
    try {
      await loadNodes();
    } catch (error) {
      console.error(error);
    }
  }
};

const chooseNode = (node: NodeStatus) => {
  selectedNode.value = node;
  daemonId.value = node.uuid;
};

const goNext = () => {
  if (step.value === 2 && daemonId.value) step.value = 3;
};

const goBack = () => {
  if (step.value === 3) step.value = 2;
  else if (step.value === 2) step.value = 1;
};

const goToNodePage = () => router.push({ path: "/node" });

const handleCreated = (instanceUuid: string) => {
  if (props.embedded) {
    emit("created", instanceUuid);
    return;
  }
  router.push({
    path: "/instances/terminal",
    query: {
      daemonId: daemonId.value,
      instanceId: instanceUuid
    }
  });
};
</script>

<template>
  <main class="create-instance-page" :class="{ 'create-instance-page--embedded': embedded }">
    <VContainer class="pa-0" fluid>
      <VCard class="create-instance-card" elevation="0" rounded="xl">
        <VCardText class="pa-0">
          <VStepper v-model="step" class="create-instance-stepper" flat>
            <VStepperHeader>
              <VStepperItem :value="1" :title="t('TXT_CODE_5a74975b')" icon="mdi-format-list-bulleted" />
              <VDivider />
              <VStepperItem :value="2" :title="t('TXT_CODE_7e267ba')" icon="mdi-server-network-outline" :disabled="!createMethod" />
              <VDivider />
              <VStepperItem :value="3" :title="t('TXT_CODE_645bc545')" icon="mdi-tune-variant" :disabled="!daemonId" />
            </VStepperHeader>

            <VStepperWindow>
              <VStepperWindowItem :value="1">
                <div class="step-content">
                  <div class="step-heading">
                    <h2>{{ t("TXT_CODE_5a74975b") }}</h2>
                    <p>{{ t("TXT_CODE_81ad9e80") }}</p>
                  </div>
                  <VRow>
                    <VCol v-for="option in methodOptions" :key="option.value" cols="12" md="4">
                      <VCard class="method-card" variant="flat" elevation="0" rounded="xl" @click="chooseMethod(option.value)">
                        <VCardText>
                          <VIcon :icon="option.icon" size="36" color="primary" />
                          <h3>{{ option.title }}</h3>
                          <p>{{ option.description }}</p>
                          <VBtn color="primary" variant="text" class="method-card-action" @click.stop="chooseMethod(option.value)">
                            {{ t("TXT_CODE_5e9022f8") }}<VIcon icon="mdi-arrow-right" end />
                          </VBtn>
                        </VCardText>
                      </VCard>
                    </VCol>
                  </VRow>
                </div>
              </VStepperWindowItem>

              <VStepperWindowItem :value="2">
                <div class="step-content">
                  <div class="step-heading">
                    <h2>{{ t("TXT_CODE_7e267ba") }}</h2>
                    <p>{{ t("TXT_CODE_ad24269a") }}</p>
                  </div>
                  <VProgressLinear v-if="nodesLoading" indeterminate color="primary" rounded="xl" />
                  <VAlert v-else-if="availableNodes.length === 0" type="warning" variant="tonal" rounded="xl">
                    <div class="node-empty-content">
                      <span>{{ t("TXT_CODE_f4110b65") }}</span>
                      <VBtn color="primary" variant="text" @click="goToNodePage">{{ t("TXT_CODE_4fe5dce5") }}</VBtn>
                    </div>
                  </VAlert>
                  <VRow v-else>
                    <VCol v-for="node in availableNodes" :key="node.uuid" cols="12" md="6">
                      <VCard
                        class="node-card"
                        :class="{ 'node-card--selected': daemonId === node.uuid }"
                        variant="flat"
                        elevation="0"
                        rounded="xl"
                        @click="chooseNode(node)"
                      >
                        <VCardText>
                          <div class="node-card-header">
                            <div class="node-card-title"><VIcon icon="mdi-server-outline" />{{ node.remarks || `${node.ip}:${node.port}` }}</div>
                            <VChip color="success" size="small" variant="tonal">{{ t("TXT_CODE_b078a763") }}</VChip>
                          </div>
                          <div class="node-card-details">
                            <span>{{ node.ip }}:{{ node.port }}</span>
                            <span>ID: {{ node.uuid }}</span>
                          </div>
                        </VCardText>
                      </VCard>
                    </VCol>
                  </VRow>
                  <div class="step-actions">
                    <VBtn variant="text" @click="goBack"><VIcon icon="mdi-arrow-left" />{{ t("TXT_CODE_c14b2ea3") }}</VBtn>
                    <VBtn color="primary" :disabled="!daemonId" @click="goNext">{{ t("TXT_CODE_5e9022f8") }}<VIcon icon="mdi-arrow-right" end /></VBtn>
                  </div>
                </div>
              </VStepperWindowItem>

              <VStepperWindowItem :value="3">
                <div class="step-content step-content--form">
                  <div class="step-heading">
                    <h2>{{ t("TXT_CODE_645bc545") }}</h2>
                    <p v-if="selectedNode">{{ selectedNode.remarks || `${selectedNode.ip}:${selectedNode.port}` }}</p>
                  </div>
                  <CreateInstanceForm
                    v-if="createMethod && daemonId"
                    :create-method="createMethod"
                    :daemon-id="daemonId"
                    :is-desktop="true"
                    @next-step="handleCreated"
                  />
                  <div class="step-actions">
                    <VBtn variant="text" @click="goBack"><VIcon icon="mdi-arrow-left" />{{ t("TXT_CODE_c14b2ea3") }}</VBtn>
                  </div>
                </div>
              </VStepperWindowItem>
            </VStepperWindow>
          </VStepper>
        </VCardText>
      </VCard>
    </VContainer>
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

.create-instance-page--embedded {
  max-width: none;
  min-height: 100%;
  padding: 0;
}

.create-instance-card {
  overflow: hidden;
  background: transparent;
}

.step-heading p {
  margin: 6px 0 0;
  color: var(--desktop-window-text-secondary, rgba(var(--v-theme-on-surface), 0.68));
  line-height: 1.5;
}

.create-instance-stepper {
  background: transparent;
  box-shadow: none !important;

  :deep(.v-stepper-header),
  :deep(.v-stepper-window) {
    background: transparent;
    box-shadow: none !important;
  }
}

.step-content {
  padding: 20px 28px 28px;
}

.step-content--form {
  max-width: 980px;
  margin: 0 auto;
}

.step-heading {
  margin-bottom: 24px;

  h2 {
    margin: 0;
    color: var(--desktop-window-text, rgb(var(--v-theme-on-surface)));
    font-size: 18px;
    font-weight: 600;
  }
}

.method-card,
.node-card {
  height: 100%;
  cursor: pointer;
  transition: border-color 0.2s ease, background-color 0.2s ease, transform 0.2s ease;

  &:hover {
    transform: translateY(-2px);
  }
}

.method-card {
  border: 0 !important;
  background-color: var(--desktop-window-titlebar-bg, rgba(var(--v-theme-surface-variant), 0.72)) !important;
  box-shadow: none !important;
  transition: background-color 0.2s ease;

  &:hover {
    transform: none;
    background-color: var(--desktop-window-control-hover, rgba(var(--v-theme-surface-variant), 0.88)) !important;
    box-shadow: none !important;
  }

  .v-card-text {
    display: flex;
    min-height: 190px;
    flex-direction: column;
    align-items: flex-start;
    padding: 24px;
  }

  h3 {
    margin: 18px 0 8px;
    color: var(--desktop-window-text, rgb(var(--v-theme-on-surface)));
    font-size: 16px;
  }

  p {
    flex: 1;
    margin: 0;
    color: var(--desktop-window-text-secondary, rgba(var(--v-theme-on-surface), 0.68));
    font-size: 13px;
    line-height: 1.55;
    white-space: pre-line;
  }
}

.method-card-action {
  margin: 14px -8px -8px;
}

.node-card.node-card--selected {
  background-color: rgba(var(--v-theme-primary), 0.16) !important;
}

.node-card {
  border: 0 !important;
  background-color: var(--desktop-window-titlebar-bg, rgba(var(--v-theme-surface-variant), 0.72)) !important;
  box-shadow: none !important;
  transition: background-color 0.2s ease;

  &:hover {
    transform: none;
    background-color: var(--desktop-window-control-hover, rgba(var(--v-theme-surface-variant), 0.88)) !important;
    box-shadow: none !important;
  }

  &.node-card--selected:hover {
    background-color: rgba(var(--v-theme-primary), 0.22) !important;
  }
}

.node-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.node-card-title {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
  color: var(--desktop-window-text, rgb(var(--v-theme-on-surface)));
  font-weight: 600;
  overflow-wrap: anywhere;
}

.node-card-details {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 14px;
  color: var(--desktop-window-text-secondary, rgba(var(--v-theme-on-surface), 0.68));
  font-size: 12px;
}

.node-empty-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.step-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 28px;
}

@media (max-width: 992px) {
  .create-instance-page {
    padding: 0 12px 80px;
  }

  .step-content {
    padding-right: 16px;
    padding-left: 16px;
  }
}

@media (min-width: 993px) {
  .create-instance-page--embedded .step-content {
    padding-right: 24px;
    padding-left: 24px;
  }
}
</style>
