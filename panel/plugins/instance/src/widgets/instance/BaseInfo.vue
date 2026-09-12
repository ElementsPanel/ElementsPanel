<script setup lang="ts">
import CardPanel from "@/components/CardPanel.vue";
import { useInstanceInfo } from "@/hooks/useInstance";
import { t } from "@/lang/i18n";
import type { LayoutCard } from "@/types";
import { computed, onMounted, ref } from "vue";
import { VChip, VIcon } from "vuetify/components";
import { GLOBAL_INSTANCE_NAME } from "@/config/const";
import { useLayoutCardTools } from "@/hooks/useCardTools";
import { parseTimestamp } from "@/tools/time";
import DockerInfo from "./dialogs/DockerInfo.vue";

const props = defineProps<{
  card: LayoutCard;
}>();

const DockerInfoDialog = ref<InstanceType<typeof DockerInfo>>();
const { getMetaOrRouteValue } = useLayoutCardTools(props.card);

const instanceId = getMetaOrRouteValue("instanceId");
const daemonId = getMetaOrRouteValue("daemonId");

const { statusText, isRunning, isStopped, instanceTypeText, instanceInfo, execute } =
  useInstanceInfo({
    instanceId,
    daemonId,
    autoRefresh: true
  });

const getInstanceName = computed(() => {
  if (instanceInfo.value?.config.nickname === GLOBAL_INSTANCE_NAME) {
    return t("TXT_CODE_5bdaf23d");
  } else {
    return instanceInfo.value?.config.nickname;
  }
});

const instanceGameServerInfo = computed(() => {
  if (instanceInfo.value?.info?.mcPingOnline) {
    return {
      players: `${instanceInfo.value?.info.currentPlayers} / ${instanceInfo.value?.info.maxPlayers}`,
      version: instanceInfo.value?.info.version
    };
  } else {
    return null;
  }
});

onMounted(async () => {
  if (instanceId && daemonId) {
    await execute({
      params: {
        uuid: instanceId,
        daemonId: daemonId
      }
    });
  }
});
</script>

<template>
  <!-- eslint-disable vue/html-indent -->
  <CardPanel class="containerWrapper" style="height: 100%">
    <template #title>
      {{ card.title }}
    </template>
    <template #body>
      <p>
        {{ t("TXT_CODE_7ec9c59c") }}
        <span class="mr-10">{{ getInstanceName }}</span>
        <VChip v-if="isRunning" color="success" size="small" variant="tonal" class="tag">
          <VIcon start icon="mdi-check-circle-outline" />
          {{ statusText }}
        </VChip>
        <VChip v-else-if="isStopped" size="small" variant="tonal" class="tag">
          <VIcon start icon="mdi-alert-circle-outline" />
          {{ statusText }}
        </VChip>
        <VChip v-else class="tag" color="pink" size="small" variant="tonal">
          {{ statusText }}
        </VChip>
      </p>
      <p>
        <span>{{ t("TXT_CODE_68831be6") }}</span>
        <span>{{ instanceTypeText }}</span>
      </p>
      <p>
        <span>
          {{ t("TXT_CODE_ad30f3c5") }}
          <VChip v-if="Number(instanceInfo?.started) > 0" size="small" variant="tonal">
            {{ instanceInfo?.started }}
          </VChip>
          <span v-else>{{ instanceInfo?.started }}</span>
        </span>
      </p>
      <p>
        <span>
          {{ t("TXT_CODE_6420023d") }}
          <VChip v-if="Number(instanceInfo?.autoRestarted) > 0" size="small" variant="tonal" class="ml-2">
            {{ instanceInfo?.autoRestarted }}
          </VChip>
          <span v-else class="ml-6">{{ instanceInfo?.autoRestarted }}</span>
        </span>
      </p>

      <p v-if="instanceGameServerInfo">
        <span>{{ t("TXT_CODE_855c4a1c") }}</span>
        <span>{{ instanceGameServerInfo.players }}</span>
      </p>
      <p v-if="instanceGameServerInfo">
        <span>
          {{ t("TXT_CODE_e260a220") }}
        </span>
        <span>
          {{ instanceGameServerInfo.version }}
        </span>
      </p>

      <template v-if="instanceInfo?.config.processType === 'docker'">
        <p>
          {{ t("TXT_CODE_4f917a65") }}
          <a href="#" @click.prevent="DockerInfoDialog?.openDialog()">
            {{ t("TXT_CODE_530f5951") }}
          </a>
        </p>
      </template>
      <p v-if="Number(instanceInfo?.info?.allocatedPorts?.length) > 0">
        {{ t("TXT_CODE_2e4469f6") }}
        <div style="padding: 10px 0px 0px 16px">
          <div
            v-for="(item, index) in instanceInfo?.info?.allocatedPorts"
            :key="index"
            class="mb-4"
          >
            <span><VChip color="success" size="small" variant="tonal">{{ item.protocol.toUpperCase() }}</VChip></span>
            <VChip size="small" variant="tonal">
              <span>{{ t("TXT_CODE_8dfc41ef") }}: {{ item.host }}</span>
              <span class="ml-4"> {{ t("TXT_CODE_8f8103b7") }}: {{ item.container }} </span>
            </VChip>
          </div>
        </div>
      </p>

      <p>
        <span>{{ t("TXT_CODE_ae747cc0") }}</span>
        <span>{{ parseTimestamp(instanceInfo?.config.endTime) || t("TXT_CODE_e3a77a77") }}</span>
      </p>
      <p v-if="!instanceGameServerInfo">
        {{ t("TXT_CODE_8b8e08a6") }}{{ parseTimestamp(instanceInfo?.config.createDatetime) }}
      </p>
      <p>
        {{ t("TXT_CODE_46f575ae") }}{{ parseTimestamp(instanceInfo?.config.lastDatetime) }}
      </p>
      <p v-if="!instanceGameServerInfo">
        <span>{{ t("TXT_CODE_cec321b4") }}{{ instanceInfo?.config.oe.toUpperCase() }} </span>
        <span class="ml-6">
          {{ t("TXT_CODE_400a4210") }}{{ instanceInfo?.config.ie.toUpperCase() }}
        </span>
      </p>
      <p>
        <span :title="instanceInfo?.instanceUuid">
          {{ t("TXT_CODE_30051f9b") }}
        </span>
        <span class="text-caption ml-1">{{ instanceInfo?.instanceUuid }}</span>
        <span class="ml-5" :title="daemonId">
          {{ t("TXT_CODE_5f2d2e30") }}
        </span>
        <span class="text-caption ml-1">{{ daemonId }}</span>
      </p>
      <p v-if="instanceInfo?.config.tag.length">
        <details open>
          <summary>{{ t("TXT_CODE_eaabd222") }}:</summary>
          <VChip
            v-for="tag in instanceInfo.config.tag"
            :key="tag"
            class="m-4"
            style="display: inline-block"
          >
            {{ tag }}
          </VChip>
        </details>
      </p>
    </template>
  </CardPanel>

  <DockerInfo ref="DockerInfoDialog" :docker-info="instanceInfo?.config.docker" />
</template>
