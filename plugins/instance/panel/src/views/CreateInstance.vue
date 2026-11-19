<script setup lang="ts">
import Empty from "@elementspanel/epanel-plugin-console/components/Empty";
import { router } from "@elementspanel/epanel-plugin-console/config/router";
import { t } from "@elementspanel/epanel-plugin-i18n";
import { useOverviewInfo, type ComputedNodeInfo } from "@elementspanel/epanel-plugin-console/hooks/useOverviewInfo";
import { QUICKSTART_METHOD } from "@elementspanel/epanel-plugin-console/hooks/widgets/quickStartFlow";
import { INSTANCE_TYPE_TRANSLATION } from "@elementspanel/epanel-plugin-console/hooks/useInstance";
import CreateInstanceForm from "../widgets/setupApp/CreateInstanceForm.vue";
import { computed, ref, watchEffect } from "vue";
import {
  VAlert,
  VAutocomplete,
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
const instanceType = ref("");
const formBusy = ref(false);
const instanceTypeOptions = computed(() =>
  Object.entries(INSTANCE_TYPE_TRANSLATION).map(([value, title]) => ({ value, title }))
);
const isMinecraft = computed(() => instanceType.value?.startsWith("minecraft/"));
const createMethod = ref<QUICKSTART_METHOD | "">("");
const daemonId = ref("");
const selectedNode = computed(() =>
  availableNodes.value.find((node) => node.uuid === daemonId.value)
);
const {
  refresh: loadNodes,
  state: overview,
  isLoading: nodesLoading
} = useOverviewInfo({ poll: false });

const availableNodes = computed(() =>
  (overview.value?.remote || []).filter((node) => node.available)
);
const canSelectNode = (node: ComputedNodeInfo) =>
  node.available &&
  (createMethod.value !== QUICKSTART_METHOD.DOWNLOAD || node.features?.minecraftInstall === true);
const canContinue = computed(
  () => !nodesLoading.value && !!selectedNode.value && canSelectNode(selectedNode.value)
);
watchEffect(() => {
  if (daemonId.value && !canContinue.value) daemonId.value = "";
});
const methodOptions = computed(() => [
  {
    value: QUICKSTART_METHOD.IMPORT,
    title: isMinecraft.value ? t("TXT_CODE_MINECRAFT_UPLOAD") : t("TXT_CODE_COMMON_IMPORT_COMPRESSED_PACKAGE"),
    description: isMinecraft.value ? t("TXT_CODE_MINECRAFT_UPLOAD_HINT") : t("TXT_CODE_INSTANCE_UPLOAD_ARCHIVE_SETUP_HINT"),
    icon: "mdi-folder-zip-outline"
  },
  ...(isMinecraft.value
    ? [
        {
          value: QUICKSTART_METHOD.DOWNLOAD,
          title: t("TXT_CODE_MINECRAFT_DOWNLOAD"),
          description: t("TXT_CODE_MINECRAFT_DOWNLOAD_HINT"),
          icon: "mdi-cloud-download-outline"
        }
      ]
    : []),
  {
    value: QUICKSTART_METHOD.DOCKER,
    title: t("TXT_CODE_COMMON_CREATE_WITH_DOCKER_IMAGE"),
    description: t("TXT_CODE_COMMON_DOCKER_NEEDS_TO_BE_INSTALLED_IN_ADVANCE_THEN_USE_ANY_IMAGE_YOU_FOUND_ON_DOCKER_HUB"),
    icon: "mdi-docker"
  },
  {
    value: QUICKSTART_METHOD.EXIST,
    title: t("TXT_CODE_COMMON_CREATE_DIRECTLY"),
    description: t("TXT_CODE_INSTANCE_EMPTY_SETUP_HINT"),
    icon: "mdi-folder-open-outline"
  }
]);

const changeInstanceType = () => {
  createMethod.value = "";
  daemonId.value = "";
};

const chooseMethod = async (method: QUICKSTART_METHOD) => {
  createMethod.value = method;
  daemonId.value = "";
  step.value = 3;
  try {
    await loadNodes(true);
  } catch (error) {
    console.error(error);
  }
};

const chooseNode = (node: ComputedNodeInfo) => {
  if (nodesLoading.value || !canSelectNode(node)) return;
  daemonId.value = node.uuid;
};

const goNext = () => {
  if (step.value === 1 && instanceType.value) step.value = 2;
  else if (step.value === 3 && canContinue.value) step.value = 4;
};

const goBack = () => {
  if (!formBusy.value && step.value > 1) step.value--;
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
      <VCard class="create-instance-card" data-app-surface="transparent" elevation="0" rounded="xl">
        <VCardText class="pa-0">
          <VStepper v-model="step" class="create-instance-stepper" flat>
            <VStepperHeader>
              <VStepperItem :value="1" :title="t('TXT_CODE_COMMON_INSTANCE_TYPE')" icon="mdi-shape-outline" />
              <VDivider />
              <VStepperItem
                :value="2"
                :title="t('TXT_CODE_COMMON_CREATE_INSTANCE')"
                icon="mdi-format-list-bulleted"
                :disabled="!instanceType"
              />
              <VDivider />
              <VStepperItem
                :value="3"
                :title="t('TXT_CODE_COMMON_SELECT_NODE')"
                icon="mdi-server-network-outline"
                :disabled="!createMethod"
              />
              <VDivider />
              <VStepperItem
                :value="4"
                :title="t('TXT_CODE_COMMON_CREATE_A_NEW_INSTANCE')"
                icon="mdi-tune-variant"
                :disabled="!canContinue"
              />
            </VStepperHeader>

            <VStepperWindow>
              <VStepperWindowItem :value="1">
                <div class="step-content step-content--form">
                  <div class="step-heading">
                    <h2>{{ t("TXT_CODE_COMMON_INSTANCE_TYPE") }}</h2>
                    <p>{{ t("TXT_CODE_COMMON_DIFFERENT_TYPES_MAY_HAVE_SLIGHTLY_DIFFERENCES_IN_SOME_FUNCTIONS") }}</p>
                  </div>
                  <VAutocomplete
                    v-model="instanceType"
                    :items="instanceTypeOptions"
                    :label="t('TXT_CODE_COMMON_INSTANCE_TYPE')"
                    :placeholder="t('TXT_CODE_COMMON_PLEASE_SELECT')"
                    variant="solo"
                    hide-details
                    @update:model-value="changeInstanceType"
                  >
                    <template #no-data><Empty :icon="false" compact /></template>
                  </VAutocomplete>
                  <div class="step-actions">
                    <VBtn color="primary" :disabled="!instanceType" @click="goNext"
                      >{{ t("TXT_CODE_COMMON_NEXT") }}<VIcon icon="mdi-arrow-right" end
                    /></VBtn>
                  </div>
                </div>
              </VStepperWindowItem>

              <VStepperWindowItem :value="2">
                <div class="step-content">
                  <div class="step-heading">
                    <h2>{{ t("TXT_CODE_COMMON_CREATE_INSTANCE") }}</h2>
                    <p>{{ t("TXT_CODE_COMMON_A_MORE_FLEXIBLE_WAY_TO_CREATE_INSTANCES_WITHOUT_INSTALLING_THROUGH_THE_APP_MARKETPLACE") }}</p>
                  </div>
                  <VRow>
                    <VCol
                      v-for="option in methodOptions"
                      :key="option.value"
                      cols="12"
                      :md="isMinecraft ? 6 : 4"
                    >
                      <VCard
                        class="method-card"
                        data-app-surface="none"
                        variant="flat"
                        elevation="0"
                        rounded="xl"
                        @click="chooseMethod(option.value)"
                      >
                        <VCardText>
                          <VIcon :icon="option.icon" size="36" color="primary" />
                          <h3>{{ option.title }}</h3>
                          <p>{{ option.description }}</p>
                          <VBtn
                            color="primary"
                            variant="text"
                            class="method-card-action"
                            @click.stop="chooseMethod(option.value)"
                          >
                            {{ t("TXT_CODE_COMMON_NEXT") }}<VIcon icon="mdi-arrow-right" end />
                          </VBtn>
                        </VCardText>
                      </VCard>
                    </VCol>
                  </VRow>
                  <div class="step-actions">
                    <VBtn variant="text" @click="goBack"
                      ><VIcon icon="mdi-arrow-left" />{{ t("TXT_CODE_COMMON_GO_BACK") }}</VBtn
                    >
                  </div>
                </div>
              </VStepperWindowItem>

              <VStepperWindowItem :value="3">
                <div class="step-content">
                  <div class="step-heading">
                    <h2>{{ t("TXT_CODE_COMMON_SELECT_NODE") }}</h2>
                  </div>
                  <VProgressLinear v-if="nodesLoading" indeterminate color="primary" rounded="xl" />
                  <Empty
                    v-else-if="availableNodes.length === 0"
                    icon="mdi-server-network-outline"
                    :title="t('TXT_CODE_COMMON_NO_AVAILABLE_NODES_HINT')"
                    compact
                  >
                    <template #actions>
                      <VBtn color="primary" variant="text" @click="goToNodePage">{{
                        t("TXT_CODE_COMMON_GO_TO_THE_NODE_PAGE")
                      }}</VBtn>
                    </template>
                  </Empty>
                  <VRow v-else>
                    <VCol v-for="node in availableNodes" :key="node.uuid" cols="12" md="6">
                      <VCard
                        class="node-card"
                        data-app-surface="none"
                        :class="{ 'node-card--selected': daemonId === node.uuid }"
                        variant="flat"
                        elevation="0"
                        rounded="xl"
                        :disabled="!canSelectNode(node)"
                        @click="chooseNode(node)"
                      >
                        <VCardText>
                          <div class="node-card-header">
                            <div class="node-card-title">
                              <VIcon icon="mdi-server-outline" />{{
                                node.remarks || `${node.ip}:${node.port}`
                              }}
                            </div>
                            <VChip color="success" size="small" variant="tonal">{{
                              t("TXT_CODE_COMMON_AVAILABLE")
                            }}</VChip>
                          </div>
                          <div class="node-card-details">
                            <span>{{ node.ip }}:{{ node.port }}</span>
                            <span>ID: {{ node.uuid }}</span>
                          </div>
                          <VAlert
                            v-if="!canSelectNode(node)"
                            type="warning"
                            variant="tonal"
                            class="mt-3"
                            >{{ t("TXT_CODE_MINECRAFT_NODE_UNSUPPORTED") }}</VAlert
                          >
                        </VCardText>
                      </VCard>
                    </VCol>
                  </VRow>
                  <div class="step-actions">
                    <VBtn variant="text" @click="goBack"
                      ><VIcon icon="mdi-arrow-left" />{{ t("TXT_CODE_COMMON_GO_BACK") }}</VBtn
                    >
                    <VBtn color="primary" :disabled="!canContinue" @click="goNext"
                      >{{ t("TXT_CODE_COMMON_NEXT") }}<VIcon icon="mdi-arrow-right" end
                    /></VBtn>
                  </div>
                </div>
              </VStepperWindowItem>

              <VStepperWindowItem :value="4">
                <div class="step-content step-content--form">
                  <div class="step-heading">
                    <h2>{{ t("TXT_CODE_COMMON_CREATE_A_NEW_INSTANCE") }}</h2>
                    <p v-if="selectedNode">
                      {{ selectedNode.remarks || `${selectedNode.ip}:${selectedNode.port}` }}
                    </p>
                  </div>
                  <CreateInstanceForm
                    v-if="createMethod && daemonId && instanceType"
                    :key="`${instanceType}:${createMethod}:${daemonId}`"
                    :create-method="createMethod"
                    :instance-type="instanceType"
                    :daemon-id="daemonId"
                    :is-desktop="true"
                    @next-step="handleCreated"
                    @busy="formBusy = $event"
                  >
                    <template #back-action>
                      <VBtn variant="text" :disabled="formBusy" @click="goBack"
                        ><VIcon icon="mdi-arrow-left" />{{ t("TXT_CODE_COMMON_GO_BACK") }}</VBtn
                      >
                    </template>
                  </CreateInstanceForm>
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
  border: 0 !important;
  background-color: var(
    --desktop-window-titlebar-bg,
    rgba(var(--v-theme-surface-variant), 0.72)
  ) !important;
  box-shadow: none !important;
}

.method-card {
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
