<script setup lang="ts">
import CardPanel from "@/components/CardPanel.vue";
import IconBtn from "@/components/IconBtn.vue";
import BetweenMenus from "@/components/BetweenMenus.vue";
import TerminalCore from "../../components/TerminalCore.vue";
import { useLayoutCardTools } from "@/hooks/useCardTools";
import { INSTANCE_TYPE_TRANSLATION, verifyEULA } from "@/hooks/useInstance";
import { useScreen } from "@/hooks/useScreen";
import { t } from "@/lang/i18n";
import { ctx } from "@/plugin/context";
import {
  killInstance,
  openInstance,
  restartInstance,
  stopInstance,
  updateInstance
} from "@/services/apis/instance";
import { sleep } from "@/tools/common";
import { reportErrorMsg } from "@/tools/validator";
import type { LayoutCard } from "@/types";
import { INSTANCE_CRASH_TIMEOUT, INSTANCE_STATUS } from "@/types/const";
import { Modal } from "@/tools/vuetifyModal";
import { computed, h, onUnmounted, ref } from "vue";
import { VBtn, VChip, VIcon, VList, VListItem, VListItemTitle, VMenu } from "vuetify/components";
import { GLOBAL_INSTANCE_NAME } from "@/config/const";
import { useTerminal, type UseTerminalHook } from "../../hooks/useTerminal";
import { arrayFilter } from "@/tools/array";

const props = defineProps<{
  card: LayoutCard;
}>();

const { isPhone } = useScreen();
const { getMetaOrRouteValue } = useLayoutCardTools(props.card);

// The `useTerminal` is shared by this component and `TerminalCore`.
// Please do not initialize `useTerminal` in this component; all initialization logic should be placed in its child component `TerminalCore.vue`.
// The state of the shared terminal is used here.
const terminalHook: UseTerminalHook = useTerminal();
const {
  state: instanceInfo,
  isStopped,
  isRunning,
  isBuys,
  isGlobalTerminal,
  isDockerMode,
  clearTerminal
} = terminalHook;

const instanceId = getMetaOrRouteValue("instanceId");
const daemonId = getMetaOrRouteValue("daemonId");
const viewType = getMetaOrRouteValue("viewType", false);
const innerTerminalType = computed(() => props.card.width === 12 && viewType === "inner");
const instanceTypeText = computed(
  () => INSTANCE_TYPE_TRANSLATION[instanceInfo.value?.config.type ?? -1]
);

const { execute: requestOpenInstance, isLoading: isOpenInstanceLoading } = openInstance();

let checkRunningTimer: NodeJS.Timeout;
const toOpenInstance = async () => {
  if (checkRunningTimer) clearTimeout(checkRunningTimer);
  clearTerminal();
  try {
    if (instanceInfo.value?.config?.type?.startsWith("minecraft/java")) {
      const flag = await verifyEULA(instanceId ?? "", daemonId ?? "");
      if (!flag) return;
      await sleep(1000);
    }

    await requestOpenInstance({
      params: {
        uuid: instanceId ?? "",
        daemonId: daemonId ?? ""
      }
    });

    checkRunningTimer = setTimeout(() => {
      if (terminalHook.isStopped.value) {
        Modal.error({
          title: t("TXT_CODE_ac405b50"),
          content: h("div", [
            h("p", t("TXT_CODE_3409258a")),
            h("p", `${t("TXT_CODE_973414e1")}：${instanceInfo.value?.config.startCommand || ""}`),
            isDockerMode.value &&
              h("p", `${t("TXT_CODE_44b585c7")}：${instanceInfo.value?.config.docker.image || ""}`)
          ])
        });
      }
    }, INSTANCE_CRASH_TIMEOUT);
  } catch (error: any) {
    reportErrorMsg(error);
  }
};

const updateCmd = computed(() => (instanceInfo.value?.config.updateCommand ? true : false));
const instanceStatusText = computed(() => INSTANCE_STATUS[instanceInfo.value?.status ?? -1]);
const quickOperations = computed(() =>
  arrayFilter([
    {
      title: t("TXT_CODE_57245e94"),
      icon: "mdi-play-circle-outline",
      noConfirm: false,
      type: "default",
      class: "button-color-success",
      click: toOpenInstance,
      props: {},
      condition: () => isStopped.value
    },
    {
      title: t("TXT_CODE_b1dedda3"),
      icon: "mdi-pause-circle-outline",
      type: "default",
      click: async (): Promise<void> => {
        try {
          await stopInstance().execute({
            params: {
              uuid: instanceId || "",
              daemonId: daemonId || ""
            }
          });
        } catch (error: any) {
          reportErrorMsg(error);
        }
      },
      props: {
        danger: true
      },
      condition: () => isRunning.value
    }
  ])
);
const instanceOperations = computed(() =>
  arrayFilter([
    {
      title: t("TXT_CODE_47dcfa5"),
      icon: "mdi-restart",
      type: "default",
      noConfirm: false,
      click: async (): Promise<void> => {
        try {
          await restartInstance().execute({
            params: {
              uuid: instanceId || "",
              daemonId: daemonId || ""
            }
          });
        } catch (error: any) {
          reportErrorMsg(error);
        }
      },
      condition: () => isRunning.value
    },
    {
      title: t("TXT_CODE_7b67813a"),
      icon: "mdi-close-circle-outline",
      type: "danger",
      class: "color-warning",
      click: async (): Promise<void> => {
        try {
          await killInstance().execute({
            params: {
              uuid: instanceId || "",
              daemonId: daemonId || ""
            }
          });
        } catch (error: any) {
          reportErrorMsg(error);
        }
      },
      condition: () => !isStopped.value
    },
    {
      title: t("TXT_CODE_40ca4f2"),
      type: "default",
      icon: "mdi-cloud-download-outline",
      click: async (): Promise<void> => {
        try {
          clearTerminal();
          await updateInstance().execute({
            params: {
              uuid: instanceId || "",
              daemonId: daemonId || "",
              task_name: "update"
            },
            data: {
              time: new Date().getTime()
            }
          });
        } catch (error: any) {
          reportErrorMsg(error);
        }
      },
      condition: () => isStopped.value && updateCmd.value
    },
    // Plugin-supplied terminal buttons, e.g. the market's reinstall tool.
    ...ctx.actions.terminalButtons({
      mode: "normal",
      instanceId: instanceId ?? "",
      daemonId: daemonId ?? "",
      instanceInfo: instanceInfo.value,
      isStopped: isStopped.value,
      isRunning: isRunning.value,
      isGlobalTerminal: isGlobalTerminal.value,
      isDockerMode: isDockerMode.value,
      clearTerminal
    })
  ])
);

const getInstanceName = computed(() => {
  if (instanceInfo.value?.config.nickname === GLOBAL_INSTANCE_NAME) {
    return t("TXT_CODE_5bdaf23d");
  } else {
    return instanceInfo.value?.config.nickname;
  }
});

const confirmAction = (action: () => any) =>
  Modal.confirm({ title: t("TXT_CODE_276756b2"), async onOk() { await action(); } });

onUnmounted(() => {
  if (checkRunningTimer) clearTimeout(checkRunningTimer);
});
</script>

<template>
  <!-- Terminal Page View -->
  <div v-if="innerTerminalType">
    <div class="mb-24">
      <BetweenMenus>
        <template #left>
          <div class="align-center">
            <h4 class="text-h6 mb-0 mr-3">
              <VIcon icon="mdi-server-outline" />
              <span class="ml-6"> {{ getInstanceName }} </span>
            </h4>
            <div v-if="!isPhone" class="mb-0 ml-2">
              <span class="ml-6">
                <VChip v-if="isRunning" color="success" size="small" variant="tonal">
                  <VIcon start icon="mdi-check-circle-outline" />
                  {{ instanceStatusText }}
                </VChip>
                <VChip v-else-if="isBuys" color="error" size="small" variant="tonal">
                  <VIcon start icon="mdi-loading" class="loading-icon" />
                  {{ instanceStatusText }}
                </VChip>
                <VChip v-else-if="instanceStatusText" size="small" variant="tonal">
                  <VIcon start icon="mdi-information-outline" />
                  {{ instanceStatusText }}
                </VChip>
              </span>

              <VChip v-if="instanceTypeText" color="purple" size="small" variant="tonal"> {{ instanceTypeText }} </VChip>

              <span
                v-if="instanceInfo?.watcher && instanceInfo?.watcher > 1 && !isPhone"
                class="ml-16"
              >
                <VIcon icon="mdi-laptop" :title="t('TXT_CODE_4a37ec9c')" />
                <span class="ml-6" style="opacity: 0.8">
                  {{ instanceInfo?.watcher }}
                </span>
              </span>
            </div>
          </div>
        </template>
        <template #right>
          <div v-if="!isPhone">
            <template v-for="item in [...quickOperations, ...instanceOperations]" :key="item.title">
              <VBtn
                class="ml-8"
                :class="item.class ? item.class : ''"
                :color="item.type === 'danger' ? 'error' : undefined"
                :disabled="isOpenInstanceLoading"
                @click="item.noConfirm ? item.click() : confirmAction(item.click)"
              >
                <VIcon start :icon="item.icon" />
                {{ item.title }}
              </VBtn>
            </template>
          </div>

          <VMenu v-else location="bottom end">
            <template #activator="{ props: menuProps }"><VBtn v-bind="menuProps" color="primary">{{ t("TXT_CODE_fe731dfc") }}<VIcon end icon="mdi-chevron-down" /></VBtn></template>
              <VList density="compact">
                <VListItem
                  v-for="item in [...quickOperations, ...instanceOperations]"
                  :key="item.title"
                  @click="item.noConfirm ? item.click() : confirmAction(item.click)"
                >
                  <template #prepend><VIcon :icon="item.icon" /></template><VListItemTitle>{{ item.title }}</VListItemTitle>
                </VListItem>
              </VList>
          </VMenu>
        </template>
      </BetweenMenus>
    </div>
    <TerminalCore
      v-if="instanceId && daemonId"
      :use-terminal-hook="terminalHook"
      :instance-id="instanceId"
      :daemon-id="daemonId"
      :height="card.height"
    />
  </div>

  <!-- Other Page View -->
  <CardPanel v-else class="containerWrapper" style="height: 100%">
    <template #title>
      <VIcon icon="mdi-server-outline" />
      <span class="ml-8"> {{ getInstanceName }} </span>
      <span class="ml-8">
        <VChip v-if="isRunning" color="success" size="small" variant="tonal">
          <VIcon start icon="mdi-check-circle-outline" />
          {{ instanceStatusText }}
        </VChip>
        <VChip v-else-if="isBuys" color="error" size="small" variant="tonal">
          <VIcon start icon="mdi-loading" class="loading-icon" />
          {{ instanceStatusText }}
        </VChip>
        <VChip v-else size="small" variant="tonal">
          <VIcon start icon="mdi-information-outline" />
          {{ instanceStatusText }}
        </VChip>
        <VChip color="purple" size="small" variant="tonal"> {{ instanceTypeText }} </VChip>
      </span>
    </template>
    <template #operator>
      <span
        v-for="item in quickOperations"
        :key="item.title"
        size="default"
        class="mr-2"
        v-bind="item.props"
      >
        <IconBtn :icon="item.icon" :title="item.title" @click="item.click"></IconBtn>
      </span>
      <VMenu location="bottom end">
        <template #activator="{ props: menuProps }"><span v-bind="menuProps"><IconBtn icon="mdi-chevron-down" :title="t('TXT_CODE_fe731dfc')" /></span></template>
        <VList density="compact"><VListItem v-for="item in instanceOperations" :key="item.title" @click="item.noConfirm ? item.click() : confirmAction(item.click)"><template #prepend><VIcon :icon="item.icon" /></template><VListItemTitle>{{ item.title }}</VListItemTitle></VListItem></VList>
      </VMenu>
    </template>
    <template #body>
      <TerminalCore
        v-if="instanceId && daemonId"
        :use-terminal-hook="terminalHook"
        :instance-id="instanceId"
        :daemon-id="daemonId"
        :height="card.height"
      />
    </template>
  </CardPanel>
</template>

<style lang="scss" scoped>
.error-card {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  top: 0;
  z-index: 10;
  border-radius: 20px;

  display: flex;
  align-items: center;
  justify-content: center;

  .error-card-container {
    overflow: hidden;
    max-width: 440px;
    border: 1px solid var(--color-gray-6) !important;
    background-color: var(--color-gray-1);
    border-radius: 4px;
    padding: 12px;
    box-shadow: 0px 0px 2px var(--color-gray-7);
  }

  @media (max-width: 992px) {
    .error-card-container {
      max-width: 90vw !important;
    }
  }
}

.console-wrapper {
  position: relative;

  .terminal-loading {
    z-index: 12;
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
  }

  .terminal-wrapper {
    border: none;
    position: relative;
    overflow: hidden;
    height: 100%;
    background-color: #1e1e1e;
    padding: 8px;
    border-radius: 6px;
    overflow: hidden;
    display: flex;
    flex-direction: column;

    .terminal-container {
      // min-width: 1200px;
      height: 100%;
    }

    margin-bottom: 12px;
  }

  .command-input {
    position: relative;

    .history {
      display: flex;
      max-width: 100%;
      overflow: scroll;
      z-index: 10;
      position: absolute;
      top: -35px;
      left: 0;

      li {
        list-style: none;

        span {
          padding: 3px 20px;
          max-width: 300px;
          overflow: hidden;
          text-overflow: ellipsis;
          cursor: pointer;
        }
      }

      &::-webkit-scrollbar {
        width: 0 !important;
        height: 0 !important;
      }
    }
  }
}
</style>
