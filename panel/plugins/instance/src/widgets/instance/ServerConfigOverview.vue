<script setup lang="ts">
import CardPanel from "@/components/CardPanel.vue";
import BetweenMenus from "@/components/BetweenMenus.vue";
import { useAppRouters } from "@/hooks/useAppRouters";
import { useLayoutCardTools } from "@/hooks/useCardTools";
import { getInstanceConfigByType, type InstanceConfigs } from "@/hooks/useInstance";
import { useScreen } from "@/hooks/useScreen";
import { t } from "@/lang/i18n";
import { getConfigFileList } from "@/services/apis/instance";
import { reportErrorMsg } from "@/tools/validator";
import type { LayoutCard } from "@/types";
import { onMounted, ref } from "vue";
import { VBtn, VCardText, VChip, VCol, VIcon, VList, VListItem, VListItemSubtitle, VListItemTitle, VProgressLinear, VRow } from "vuetify/components";

const props = defineProps<{
  card: LayoutCard;
}>();

const { isPhone } = useScreen();
const { getMetaOrRouteValue } = useLayoutCardTools(props.card);
const instanceId = getMetaOrRouteValue("instanceId");
const daemonId = getMetaOrRouteValue("daemonId");
const type = getMetaOrRouteValue("type");

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
  <div style="height: 100%" class="container">
    <VRow dense style="height: 100%">
      <VCol cols="12">
        <BetweenMenus>
          <template v-if="!isPhone" #left>
            <h4 class="text-h6 mb-0">
              {{ card.title }}
            </h4>
          </template>
          <template #right>
            <VBtn variant="tonal" @click="toConsole">
              {{ t("TXT_CODE_95b9833f") }}
            </VBtn>
            <VBtn :loading="isLoading" variant="tonal" @click="render">
              {{ t("TXT_CODE_b76d94e0") }}
            </VBtn>
          </template>
        </BetweenMenus>
      </VCol>

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
  </div>
</template>

<style lang="scss" scoped></style>
