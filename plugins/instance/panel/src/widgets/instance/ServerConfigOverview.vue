<script setup lang="ts">
import Empty from "@elementspanel/epanel-plugin-console/components/Empty";
import CardPanel from "@elementspanel/epanel-plugin-console/components/CardPanel";
import PageToolbar from "@elementspanel/epanel-plugin-console/components/PageToolbar";
import { useAppRouters } from "@elementspanel/epanel-plugin-console/hooks/useAppRouters";
import { getInstanceConfigByType, type InstanceConfigs } from "@elementspanel/epanel-plugin-console/hooks/useInstance";
import { t } from "@elementspanel/epanel-plugin-i18n";
import { getConfigFileList } from "@elementspanel/epanel-plugin-console/services/apis/instance";
import { reportErrorMsg } from "@elementspanel/epanel-plugin-console/tools/validator";
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
    if (!realFiles.value) return reportErrorMsg(t("TXT_CODE_COMMON_FAILED_TO_RETRIEVE_CONFIGURATION_FILE_LIST"));
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
      <PageToolbar :title="t('TXT_CODE_COMMON_CONFIGURATION_FILES')" icon="mdi-file-cog-outline">
        <template #actions>
          <VBtn variant="tonal" @click="toConsole">
            {{ t("TXT_CODE_COMMON_RETURN_TO_CONSOLE") }}
          </VBtn>
          <VBtn :loading="isLoading" variant="tonal" @click="render">
            {{ t("TXT_CODE_COMMON_REFRESH") }}
          </VBtn>
        </template>
      </PageToolbar>

      <VRow density="compact" class="server-config-row">
        <VCol cols="12">
          <CardPanel>
          <template #body>
            <VProgressLinear v-if="isLoading" indeterminate color="primary" class="mb-2" />
            <VList v-if="realFiles && realFiles.length > 0" lines="three" class="app-responsive-list">
              <VListItem v-for="item in InstanceConfigsList.filter((entry) => entry.check)" :key="item.path">
                <template #prepend><VIcon icon="mdi-file-document-outline" /></template>
                <VListItemTitle>
                      <VChip v-if="item.conflict" color="warning" size="small" variant="tonal">
                        {{ t("TXT_CODE_COMMON_DUPLICATE_FILE_CLEAN_UP_DUPLICATES_FIRST") }}
                      </VChip>
                      <span class="ml-2">{{ item.fileName }}</span>
                </VListItemTitle>
                <VListItemSubtitle>
                      {{ item.info }}
                      <br />
                      <span v-if="item.conflict" class="text-error">
                        {{ t("TXT_CODE_GAME_CONFIG_COMPATIBILITY_UNKNOWN_HINT") }}
                      </span>
                </VListItemSubtitle>
                <template #append>
                    <VBtn variant="tonal" @click="toEdit(item.redirect, item.path, item.type)">
                      {{ t("TXT_CODE_COMMON_EDIT") }}
                    </VBtn>
                </template>
              </VListItem>
            </VList>
            <Empty
              v-else
              icon="mdi-file-alert-outline"
              :title="t('TXT_CODE_COMMON_NO_AVAILABLE_CONFIGURATION_FILE_FOUND')"
              :description="t('TXT_CODE_GAME_CONFIG_GENERATION_HINT')"
            />
          </template>
        </CardPanel>
      </VCol>
      </VRow>
    </VContainer>
  </main>
</template>

<style lang="scss" scoped>
@use "./server-config-page";
</style>
