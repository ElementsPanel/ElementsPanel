<script setup lang="ts">
import CardPanel from "@/components/CardPanel.vue";
import PageToolbar from "@/components/PageToolbar.vue";
import { useAppRouters } from "@/hooks/useAppRouters";
import { getInstanceConfigByType, type InstanceConfigs } from "@/hooks/useInstance";
import { t } from "@/lang/i18n";
import { getConfigFileList } from "@/services/apis/instance";
import { reportErrorMsg } from "@/tools/validator";
import { onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { VBtn, VChip, VCol, VContainer, VIcon, VList, VListItem, VListItemSubtitle, VListItemTitle, VProgressLinear, VRow } from "vuetify/components";

const route = useRoute();
const instanceId = String(route.query.instanceId ?? "");
const daemonId = String(route.query.daemonId ?? "");
const type = String(route.query.type ?? "");

const { toPage } = useAppRouters();
const toConsole = () => {
  toPage({
    path: "/instances/terminal",
    query: {
      daemonId,
      instanceId
    }
  });
};

const InstanceConfigsList = ref<InstanceConfigs[]>([]);
const { execute, state: realFiles, isLoading } = getConfigFileList();
const render = async () => {
  try {
    const configFiles: InstanceConfigs[] = getInstanceConfigByType(type ?? "");
    const files: string[] = [];
    configFiles.forEach((v: InstanceConfigs) => {
      files.push(v.path);
    });
    await execute({
      params: {
        uuid: instanceId ?? "",
        daemonId: daemonId ?? ""
      },
      data: {
        files: files
      }
    });
    if (!realFiles.value) return reportErrorMsg(t("TXT_CODE_83e553fc"));
    realFiles.value.forEach((v) => {
      configFiles.forEach((z) => {
        if (z.path === v.file) {
          configFiles.forEach((p) => {
            if (p.path == z.path && p.check) z.conflict = true;
          });
          z.check = true;
        }
      });
    });
    InstanceConfigsList.value = configFiles;
  } catch (err: any) {
    console.error(err);
    return reportErrorMsg(err.message);
  }
};

const toEdit = (configName: string, configPath: string, extName: string) => {
  toPage({
    path: "/instances/terminal/serverConfig/fileEdit",
    query: {
      type: type,
      configName,
      configPath,
      extName
    }
  });
};

onMounted(async () => {
  await render();
});
</script>

<template>
  <main class="server-config-page">
    <VContainer fluid class="server-config-page-container">
      <PageToolbar :title="t('TXT_CODE_d07742fe')" icon="mdi-file-cog-outline">
        <template #actions>
          <VBtn variant="tonal" @click="toConsole">
            {{ t("TXT_CODE_95b9833f") }}
          </VBtn>
          <VBtn :loading="isLoading" variant="tonal" @click="render">
            {{ t("TXT_CODE_b76d94e0") }}
          </VBtn>
        </template>
      </PageToolbar>

      <VRow dense class="server-config-row">
        <VCol cols="12">
          <CardPanel style="height: 100%">
          <template #body>
            <VProgressLinear v-if="isLoading" indeterminate color="primary" class="mb-2" />
            <VList v-if="realFiles && realFiles.length > 0" lines="three">
              <VListItem v-for="item in InstanceConfigsList.filter((entry) => entry.check)" :key="item.path">
                <template #prepend><VIcon icon="mdi-file-document-outline" /></template>
                <VListItemTitle>
                      <VChip v-if="item.conflict" color="warning" size="small" variant="tonal">
                        {{ t("TXT_CODE_1af148fe") }}
                      </VChip>
                      <span class="ml-2">{{ item.fileName }}</span>
                </VListItemTitle>
                <VListItemSubtitle>
                      {{ item.info }}
                      <br />
                      <span v-if="item.conflict" class="text-error">
                        {{ t("TXT_CODE_91b3fa98") }}
                      </span>
                </VListItemSubtitle>
                <template #append>
                    <VBtn variant="tonal" @click="toEdit(item.redirect, item.path, item.type)">
                      {{ t("TXT_CODE_ad207008") }}
                    </VBtn>
                </template>
              </VListItem>
            </VList>
            <div v-else class="empty-config-state"><VIcon icon="mdi-file-alert-outline" size="32" /><p>{{ t("TXT_CODE_37a4c14a") }}</p><p class="text-body-2 text-medium-emphasis">{{ t("TXT_CODE_4c0fda9") }}</p></div>
          </template>
        </CardPanel>
      </VCol>
      </VRow>
    </VContainer>
  </main>
</template>

<style lang="scss" scoped>
.server-config-page {
  width: 100%;
  min-height: 100%;
  overflow-x: hidden;
}

.server-config-page-container {
  max-width: var(--app-max-width);
  margin: 0 auto;
  padding: 20px 24px 32px;
}

.server-config-row {
  width: 100%;
  margin: 0;
}

@media (max-width: 992px) {
  .server-config-page-container {
    padding: 16px 12px 28px;
  }
}
</style>
