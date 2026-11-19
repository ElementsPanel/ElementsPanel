<script setup lang="ts">
import Empty from "@elementspanel/epanel-plugin-console/components/Empty";
import { useXhrPollError } from "@elementspanel/epanel-plugin-console/hooks/useXhrPollError";
import { t } from "@elementspanel/epanel-plugin-i18n";
import { logInstanceAutoRestart, logInstanceCrash } from "@elementspanel/epanel-plugin-console/services/apis/operationLog";
import { getRandomId } from "@elementspanel/epanel-plugin-console/tools/randId";
import { message } from "@elementspanel/epanel-plugin-console/tools/vuetifyToast";
import { onMounted, ref } from "vue";
import {
  VBtn,
  VChip,
  VExpansionPanel,
  VExpansionPanels,
  VProgressCircular,
  VTextField,
  VTooltip
} from "vuetify/components";
import { getInstanceOutputLog } from "../api";
import { useCommandHistory } from "../hooks/useCommandHistory";
import type { UseTerminalHook } from "../hooks/useTerminal";

// Deduplicate crash and restart logs across terminal components.
let lastCrashLogTime = 0;
const CRASH_LOG_DEDUP_MS = 8000;
let lastAutoRestartLogTime = 0;
const AUTO_RESTART_LOG_DEDUP_MS = 8000;

const props = defineProps<{
  instanceId: string;
  daemonId: string;
  height: string;
  useTerminalHook: UseTerminalHook;
}>();

const {
  focusHistoryList,
  selectLocation,
  history,
  commandInputValue,
  handleHistorySelect,
  clickHistoryItem
} = useCommandHistory();

const {
  state,
  events,
  isConnect,
  socketAddress,
  execute: setUpTerminal,
  initTerminalWindow,
  sendCommand,
  writeOutputHistory,
  clearTerminal
} = props.useTerminalHook;

const instanceId = props.instanceId;
const daemonId = props.daemonId;

const terminalDomId = `terminal-window-${getRandomId()}`;

const socketError = ref<Error>();
const { isXhrPollError, xhrPollErrorReason } = useXhrPollError(socketError);

let inputRef = ref<HTMLElement | null>(null);

const handleSendCommand = () => {
  if (focusHistoryList.value) return;
  sendCommand(commandInputValue.value || "");
  commandInputValue.value = "";
};

const handleClickHistoryItem = (item: string) => {
  clickHistoryItem(item);
  inputRef.value?.focus();
};

defineExpose({ focusCommandInput: () => inputRef.value?.focus() });

const initTerminal = async () => {
  const dom = document.getElementById(terminalDomId);
  if (dom) {
    const term = initTerminalWindow(dom);
    return term;
  }
  throw new Error(t("TXT_CODE_COMMON_TERMINAL_INITIALIZATION_FAILED_PLEASE_REFRESH_THE_WEB_PAGE_AND_TRY_AGAIN"));
};

events.on("opened", () => {
  message.success(t("TXT_CODE_COMMON_INSTANCE_RUNNING"));
});

events.on("stopped", () => {
  message.success(t("TXT_CODE_COMMON_INSTANCE_STOPPED"));
});

events.on("crashed", (data: { exitCode: number }) => {
  const now = Date.now();
  if (now - lastCrashLogTime < CRASH_LOG_DEDUP_MS) return;
  lastCrashLogTime = now;
  logInstanceCrash()
    .execute({
      data: {
        daemonId: daemonId,
        instanceId: instanceId,
        instanceName: state.value?.config?.nickname,
        exitCode: data?.exitCode
      }
    })
    .catch(() => {});
});

events.on("autoRestarted", () => {
  const now = Date.now();
  if (now - lastAutoRestartLogTime < AUTO_RESTART_LOG_DEDUP_MS) return;
  lastAutoRestartLogTime = now;
  logInstanceAutoRestart()
    .execute({
      data: {
        daemonId: daemonId,
        instanceId: instanceId,
        instanceName: state.value?.config?.nickname
      }
    })
    .catch(() => {});
});

events.on("error", (error: Error) => {
  socketError.value = error;
});

events.on("connect", () => {
  socketError.value = undefined;
});

events.once("detail", async () => {
  try {
    const { value } = await getInstanceOutputLog().execute({
      params: { uuid: instanceId || "", daemonId: daemonId || "" }
    });

    if (value) {
      writeOutputHistory(value);
    }
  } catch (error: any) {}
});

const refreshPage = () => {
  window.location.reload();
};

// Initialize the terminal here once; parent components must not initialize it again.
onMounted(async () => {
  try {
    if (instanceId && daemonId) {
      await setUpTerminal({
        instanceId,
        daemonId
      });
    }
    await initTerminal();
  } catch (error: any) {
    console.error(error);
    throw error;
  }
});
</script>

<template>
  <div class="console-wrapper">
    <div v-if="!isConnect && !socketError" class="terminal-loading">
      <VProgressCircular indeterminate color="white" />
    </div>
    <div v-show="!socketError" class="terminal-button-group position-absolute-right position-absolute-top">
      <ul>
        <li>
          <VTooltip location="top">
            <template #activator="{ props: tooltipProps }">
              <VBtn
                v-bind="tooltipProps"
                icon="mdi-delete-outline"
                variant="text"
                size="small"
                color="white"
                :aria-label="t('TXT_CODE_COMMON_CLEAR_TERMINAL_OUTPUT')"
                @click="clearTerminal()"
              />
            </template>
            <span>{{ t("TXT_CODE_COMMON_CLEAR_TERMINAL_OUTPUT") }}</span>
          </VTooltip>
        </li>
      </ul>
    </div>
    <div class="terminal-wrapper global-card-container-shadow position-relative" data-app-surface="terminal">
      <div class="terminal-container">
        <div
          :id="terminalDomId"
          :style="{ height: props.height }"
        ></div>
      </div>
    </div>
    <div class="command-input">
      <div v-show="focusHistoryList" class="history">
        <li v-for="(item, key) in history" :key="item">
          <VChip
            data-app-surface="card"
            size="small"
            :color="key !== selectLocation ? 'info' : 'primary'"
            @click="handleClickHistoryItem(item)"
          >
            {{ item.length > 14 ? item.slice(0, 14) + "..." : item }}
          </VChip>
        </li>
      </div>
      <VTextField
        ref="inputRef"
        v-model="commandInputValue"
        :placeholder="t('TXT_CODE_COMMON_ENTER_COMMAND_AND_PRESS_ENTER_TO_SEND_USE_ARROW_KEYS_TO_NAVIGATE_HISTORICAL_COMMANDS')"
        prepend-inner-icon="mdi-code-tags"
        variant="outlined"
        density="comfortable"
        hide-details
        autofocus
        :disabled="!isConnect"
        @keydown="handleHistorySelect"
        @keyup.enter="handleSendCommand"
      />
    </div>

    <div v-if="socketError" class="terminal-error">
      <Empty icon="mdi-lan-disconnect" :title="t('TXT_CODE_COMMON_UNABLE_TO_CONNECT_TO_REMOTE_DAEMON')" compact>
        <template #description>
          <p>{{ t("TXT_CODE_COMMON_BROWSER_UNABLE_TO_CONNECT_TO_ADDRESS") + socketAddress }}</p>
          <p class="terminal-error-message">
            <strong>{{ t("TXT_CODE_COMMON_ERROR_INFORMATION") }}</strong>
            {{ socketError.message }}
          </p>
          <p v-if="isXhrPollError">{{ xhrPollErrorReason }}</p>
          <VExpansionPanels class="terminal-error-details" variant="accordion" flat>
            <VExpansionPanel :title="t('TXT_CODE_COMMON_SOLUTION')" bg-color="transparent">
              <template #text>
                <div v-if="isXhrPollError" class="terminal-error-links">
                  <strong>{{ t("TXT_CODE_COMMON_RELATED_DOCUMENTS") }}</strong>
                  <a
                    href="https://docs.mcsmanager.com/ops/proxy_https.html"
                    target="_blank"
                    rel="noopener noreferrer"
                  >{{ t("TXT_CODE_COMMON_REVERSE_PROXY_DESCRIPTION") }}</a>
                  <a
                    href="https://docs.mcsmanager.com/ops/mcsm_network.html"
                    target="_blank"
                    rel="noopener noreferrer"
                  >{{ t("TXT_CODE_COMMON_NETWORK_ARCHITECTURE_DESCRIPTION") }}</a>
                </div>
                <ul>
                  <li>{{ t("TXT_CODE_COMMON_IF_YOU_ARE_A_REGULAR_USER_PLEASE_CONTACT_THE_PANEL_ADMINISTRATOR") }}</li>
                  <li>{{ t("TXT_CODE_COMMON_CHECK_THAT_THE_BROWSER_CAN_REACH_THE_NODE_ADDRESS_AND_ITS_PORT_IS_OPEN") }}</li>
                  <li>{{ t("TXT_CODE_SERVER_SSL_REVERSE_PROXY_WEBSOCKET_HINT") }}</li>
                </ul>
              </template>
            </VExpansionPanel>
          </VExpansionPanels>
        </template>
        <template #actions>
          <VBtn variant="tonal" prepend-icon="mdi-refresh" @click="refreshPage">{{
            t("TXT_CODE_COMMON_RECONNECT")
          }}</VBtn>
        </template>
      </Empty>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.terminal-error {
  position: absolute;
  inset: 0;
  z-index: 10;
  overflow: auto;
  border-radius: 12px;
  background: var(--color-gray-1);

  :deep(.app-empty) {
    min-height: 100%;
  }
}

.terminal-error-message {
  margin: 8px 0;
  white-space: pre-wrap;
}

.terminal-error-details {
  margin-top: 16px;
  text-align: start;

  :deep(.v-expansion-panel-title) {
    font-weight: 600;
  }

  ul {
    margin-top: 12px;
    padding-inline-start: 20px;
  }
}

.terminal-error-links {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
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

  .terminal-button-group {
    z-index: 11;
    margin-right: 20px;
    padding-bottom: 50px;
    padding-left: 50px;
    border-radius: 6px;
    color: #fff;

    &:hover {
      ul {
        transition: all 1s;
        opacity: 0.8;
      }
    }

    ul {
      display: flex;
      opacity: 0;

      li {
        cursor: pointer;
        list-style: none;
        padding: 5px;
        margin-left: 5px;
        border-radius: 6px;
        font-size: 20px;

        &:hover {
          background-color: #3e3e3e;
        }
      }
    }
  }

  .terminal-wrapper {
    border: none;
    position: relative;
    overflow: hidden;
    height: 100%;
    background-color: #1e1e1e;
    padding: 8px;
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    .terminal-container {
      height: 100%;
    }

    margin-bottom: 12px;
  }

  .command-input {
    position: relative;

    .history {
      display: flex;
      gap: 8px;
      max-width: 100%;
      overflow-x: auto;
      overflow-y: hidden;
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
    }
  }
}
</style>
