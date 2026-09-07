<script setup lang="ts">
import PageToolbar from "@/components/PageToolbar.vue";
import FadeUpAnimation from "@/components/FadeUpAnimation.vue";
import { t } from "@/lang/i18n";
import { reportErrorMsg } from "@/tools/validator";
import { ref } from "vue";
import {
  VBtn,
  VCol,
  VContainer,
  VPagination,
  VRow,
  VSelect,
  VTextField
} from "vuetify/lib/components/index.mjs";
import { useRemoteNode } from "../hooks/useRemoteNode";
import NodeDetailDialog from "./node/NodeDetailDialog.vue";
import NodeItem from "./node/NodeItem.vue";

// Keep the legacy card registration harmless while the /node route remains fixed.
defineProps<{ card?: unknown }>();

const nodeDetailDialog = ref<InstanceType<typeof NodeDetailDialog>>();

const {
  operationForm,
  remoteNodes: remotes,
  refreshLoading,
  currentStatus,
  refresh: refreshOverviewInfo
} = useRemoteNode();

const refresh = async () => {
  try {
    refreshLoading.value = true;
    await refreshOverviewInfo();
  } catch (error: any) {
    reportErrorMsg(error.message);
  } finally {
    refreshLoading.value = false;
  }
};

const handleOpenDetailDialog = async () => {
  nodeDetailDialog.value?.openDialog();
};
</script>

<template>
  <main class="node-page">
    <VContainer fluid class="node-page-container">
      <PageToolbar :title="t('TXT_CODE_20509fa0')" icon="mdi-server-network-outline">
        <template #search>
          <div class="node-search-row">
            <VSelect
              v-model="currentStatus"
              :items="[
                { title: t('TXT_CODE_c48f6f64'), value: 'all' },
                { title: t('TXT_CODE_823bfe63'), value: true },
                { title: t('TXT_CODE_66ce073e'), value: false }
              ]"
              class="status-select"
              density="comfortable"
              hide-details
            />
            <VTextField
              v-model.trim="operationForm.name"
              :placeholder="t('TXT_CODE_461d1a01')"
              class="node-search-field"
              density="comfortable"
              hide-details
              prepend-inner-icon="mdi-magnify"
              @change="operationForm.current = 1"
            />
          </div>
        </template>
        <template #actions>
          <VBtn
            :disabled="refreshLoading"
            :loading="refreshLoading"
            variant="text"
            @click="refresh"
          >
            {{ t("TXT_CODE_b76d94e0") }}
          </VBtn>
          <VBtn color="primary" @click="handleOpenDetailDialog">
            {{ t("TXT_CODE_15a381d5") }}
          </VBtn>
          <VBtn href="https://docs.mcsmanager.com/" target="_blank" variant="text">
            {{ t("TXT_CODE_3a302f23") }}
          </VBtn>
        </template>
      </PageToolbar>

      <VRow dense class="node-list-row">
        <VCol cols="12">
          <div class="desc">
            <div class="desc-text">
              {{ t("TXT_CODE_f9a92e38") }}
              <br />
              {{ t("TXT_CODE_a65c65c2") }}
            </div>
            <div class="pagination">
              <VPagination
                v-model="operationForm.current"
                :length="Math.max(1, Math.ceil(operationForm.total / operationForm.pageSize))"
                density="compact"
                total-visible="5"
              />
              <VSelect
                v-model="operationForm.pageSize"
                :items="[8, 16, 24, 48]"
                class="page-size-select"
                density="compact"
                hide-details
                variant="solo-filled"
              />
            </div>
          </div>
        </VCol>
        <fade-up-animation v-if="!refreshLoading" :delay="3000">
          <VCol
            v-for="(item, index) in remotes"
            :key="item.uuid + item.available + item.ip"
            :data-index="index"
            cols="12"
            lg="6"
          >
            <NodeItem :item="item" />
          </VCol>
        </fade-up-animation>
      </VRow>
    </VContainer>
    <NodeDetailDialog ref="nodeDetailDialog" />
  </main>
</template>

<style lang="scss" scoped>
.node-search-row {
  display: flex;
  width: 100%;
  gap: 8px;
}

.node-page {
  width: 100%;
  min-height: 100%;
  overflow-x: hidden;
}

.node-page-container {
  max-width: var(--app-max-width);
  margin: 0 auto;
  padding: 20px 24px 32px;
}

.status-select {
  flex: 0 0 100px;
}
.node-search-field {
  flex: 1;
}
.node-list-row {
  width: 100%;
  height: 100%;
  margin: 0;
}
.desc-text {
  color: var(--color-gray-7);
  font-size: 13px;
}
.pagination {
  display: flex;
  align-items: center;
  gap: 8px;
}
.page-size-select {
  width: 96px;
}

.desc {
  display: flex;
  justify-content: space-between;
}

@media (max-width: 992px) {
  .node-page-container {
    padding: 16px 12px 28px;
  }

  .desc {
    flex-direction: column;
    .pagination {
      margin-top: 10px;
    }
  }
}
</style>
