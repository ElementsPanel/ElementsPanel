<script setup lang="ts">
import { t } from "@/lang/i18n";
import {
  CloudDownloadOutlined,
  CloudUploadOutlined,
  DeleteOutlined,
  LoadingOutlined,
  SwapOutlined
} from "@ant-design/icons-vue";
import { Button, Popover, Progress } from "ant-design-vue";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";

import { stopTransferApi } from "@/services/apis/modManager";
import { message } from "ant-design-vue";

const props = defineProps<{
  instanceId: string;
  daemonId: string;
  deferredTasks: any[];
  autoExecute: boolean;
  fileStatus: any;
  isExecuting: boolean;
}>();

const emit = defineEmits<{
  (e: "update:deferredTasks", value: any[]): void;
  (e: "update:autoExecute", value: boolean): void;
  (e: "executeTask", task: any): void;
  (e: "executeAll"): void;
  (e: "clearAll"): void;
  (e: "removeTask", id: string): void;
  (e: "refresh"): void;
}>();

const activeTasksCount = computed(() => {
  return props.fileStatus?.downloadTasks?.filter((t: any) => t.status === 0).length || 0;
});

const rippleKey = ref(0);

watch(activeTasksCount, (newVal, oldVal) => {
  if (newVal > oldVal) {
    rippleKey.value++;
  }
});

const onStopTransfer = async (task: any) => {
  try {
    const { execute } = stopTransferApi();
    await execute({
      data: {
        daemonId: props.daemonId,
        uuid: props.instanceId,
        fileName: task.path,
        type: task.type,
        uploadId: task.id
      }
    });
    message.success(t("TXT_CODE_7f0c746d"));
    emit("refresh");
  } catch (err: any) {
    message.error(err.message);
  }
};

// --- Draggable logic ---
const buttonRef = ref<HTMLElement | null>(null);
const posX = ref(24);
const posY = ref(80);
const isDragging = ref(false);
const dragOffset = ref({ x: 0, y: 0 });

const onMouseDown = (e: MouseEvent) => {
  const btn = buttonRef.value;
  if (!btn) return;
  const rect = btn.getBoundingClientRect();
  // Use left/top internally for proper dragging
  dragOffset.value = {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top
  };
  isDragging.value = true;
  e.preventDefault();
};

const onMouseMove = (e: MouseEvent) => {
  if (!isDragging.value) return;
  const btn = buttonRef.value;
  if (!btn) return;
  const rect = btn.getBoundingClientRect();

  let left = e.clientX - dragOffset.value.x;
  let top = e.clientY - dragOffset.value.y;

  // Clamp to viewport
  left = Math.max(0, Math.min(left, window.innerWidth - rect.width));
  top = Math.max(0, Math.min(top, window.innerHeight - rect.height));

  // Convert left/top to right/bottom for styling
  posX.value = window.innerWidth - left - rect.width;
  posY.value = window.innerHeight - top - rect.height;
};

const onMouseUp = () => {
  isDragging.value = false;
};

onMounted(() => {
  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);
});

onUnmounted(() => {
  document.removeEventListener("mousemove", onMouseMove);
  document.removeEventListener("mouseup", onMouseUp);
});
</script>

<template>
  <teleport to="body">
    <Popover placement="leftBottom" trigger="click" overlay-class-name="frosted-popover" :arrow="false">
      <template #content>
        <div class="dw-window">
          <!-- Title Bar (DesktopWindow style) -->
          <div class="dw-titlebar">
            <div class="dw-titlebar-left">
              <span class="dw-icon">
                <SwapOutlined />
              </span>
              <span class="dw-title">{{ t("TXT_CODE_TRANSFER_MANAGER") }}</span>
              <span class="dw-badge">{{ fileStatus?.downloadTasks?.length || 0 }}</span>
            </div>
          </div>

          <!-- Content -->
          <div class="dw-content custom-scrollbar">
            <div v-if="!fileStatus?.downloadTasks?.length && !fileStatus?.downloadFileFromURLTask" class="empty-state">
              <div class="empty-icon">
                <SwapOutlined style="font-size: 28px" class="empty-icon-inner" />
              </div>
              <div class="empty-text">
                {{ t("TXT_CODE_NO_TRANSFER_TASK") }}
              </div>
            </div>

            <div v-if="
              fileStatus?.downloadFileFromURLTask > 0 &&
              (!fileStatus.downloadTasks || fileStatus.downloadTasks.length === 0)
            " class="url-task-indicator">
              <div class="url-task-icon">
                <loading-outlined class="url-task-icon-inner" />
              </div>
              <span class="url-task-text">{{
                t("TXT_CODE_8b7fe641", { count: fileStatus.downloadFileFromURLTask })
              }}</span>
            </div>

            <div class="task-list">
              <div v-for="task in fileStatus.downloadTasks" :key="task.path" class="task-item">
                <div class="task-header">
                  <div class="task-info">
                    <div :class="[
                      'task-icon',
                      task.type === 'download' ? 'task-icon-download' : 'task-icon-upload'
                    ]">
                      <CloudDownloadOutlined v-if="task.type === 'download'" style="font-size: 22px" />
                      <CloudUploadOutlined v-else style="font-size: 22px" />
                    </div>
                    <div class="task-details">
                      <div class="task-filename" :title="task.path">
                        {{ task.path.split(/[\\/]/).pop() || task.path }}
                      </div>
                      <div class="task-status-text">
                        <span v-if="task.status === 2" class="task-status-error">{{
                          task.error || t("TXT_CODE_DOWNLOAD_FAILED")
                        }}</span>
                        <span v-else-if="task.status === 1" class="task-status-success">{{
                          t("TXT_CODE_FINISHED")
                        }}</span>
                        <template v-else>
                          <span class="task-status-progress">{{ (task.current / 1024 / 1024).toFixed(2) }}MB</span>
                          <span v-if="task.total > 0" class="task-status-total">/ {{ (task.total / 1024 /
                            1024).toFixed(2)
                          }}MB</span>
                        </template>
                      </div>
                    </div>
                  </div>
                  <div class="task-actions">
                    <span :class="[
                      'task-percent',
                      task.status === 2
                        ? 'task-percent-error'
                        : task.status === 1
                          ? 'task-percent-success'
                          : task.type === 'upload'
                            ? 'task-percent-upload'
                            : 'task-percent-download'
                    ]">
                      {{ task.total > 0 ? Math.floor((task.current / task.total) * 100) : 0 }}%
                    </span>
                    <Button v-if="task.status === 0" size="large" type="text" danger class="task-stop-button"
                      @click="onStopTransfer(task)">
                      <template #icon>
                        <DeleteOutlined style="font-size: 18px" />
                      </template>
                    </Button>
                  </div>
                </div>
                <div class="task-progress-wrapper">
                  <Progress :percent="task.status === 1
                    ? 100
                    : task.total > 0
                      ? Math.floor((task.current / task.total) * 100)
                      : 0
                    " :show-info="false" :status="task.status === 2 ? 'exception' : task.status === 1 ? 'success' : 'active'
                      " :stroke-width="6" :stroke-color="task.status === 2
                        ? '#ef4444'
                        : task.status === 1
                          ? '#22c55e'
                          : task.type === 'upload'
                            ? '#f97316'
                            : '#3b82f6'
                        " class="task-progress" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- Draggable trigger button -->
      <div ref="buttonRef" class="draggable-trigger" :class="{ 'draggable-trigger--dragging': isDragging }" :style="{
        position: 'fixed',
        right: posX + 'px',
        bottom: posY + 'px',
        zIndex: 9999
      }" @mousedown="onMouseDown">
        <div class="draggable-trigger__body">
          <SwapOutlined />
        </div>
        <span v-if="activeTasksCount > 0" class="draggable-trigger__badge">{{ activeTasksCount > 99 ? '99+' :
          activeTasksCount
        }}</span>
        <span v-if="activeTasksCount > 0" :key="rippleKey" class="draggable-trigger__ripple"></span>
      </div>
    </Popover>
  </teleport>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(156, 163, 175, 0.2);
  border-radius: 10px;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgba(156, 163, 175, 0.4);
}

/* ===== DesktopWindow-style wrapper ===== */
.dw-window {
  width: 400px;
  max-height: 600px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.dw-titlebar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 38px;
  padding: 0 8px 0 12px;
  background: transparent;
  cursor: default;
  user-select: none;
  flex-shrink: 0;
  margin: -12px -12px 0 -12px;
}

.dw-titlebar-left {
  display: flex;
  align-items: center;
  gap: 8px;
  overflow: hidden;
}

.dw-icon {
  font-size: 14px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  color: var(--desktop-window-text, #262626);
}

.dw-title {
  font-size: 12px;
  color: var(--desktop-window-text, #262626);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 600;
}

.dw-badge {
  font-size: 0.75rem;
  opacity: 0.3;
  padding-left: 0.5rem;
  padding-right: 0.5rem;
  padding-top: 0.125rem;
  padding-bottom: 0.125rem;
  border-radius: 0.375rem;
  color: var(--desktop-window-text, #262626);
}

.dw-content {
  flex: 1;
  overflow-y: auto;
  padding: 12px 0 6px;
  color: var(--desktop-window-text, #262626);
}

/* ===== Empty state ===== */
.empty-state {
  padding-top: 3rem;
  padding-bottom: 4rem;
  text-align: center;
}

.empty-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 4rem;
  height: 4rem;
  margin-bottom: 5px;
}

.empty-icon-inner {
  opacity: 0.1;
}

.empty-text {
  font-size: 0.75rem;
  opacity: 0.2;
  font-weight: 300;
  text-transform: uppercase;
}

/* ===== URL task indicator ===== */
.url-task-indicator {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1.25rem;
  border-radius: 0.75rem;
  background-color: rgba(59, 130, 246, 0.05);
  border: 1px solid rgba(59, 130, 246, 0.1);
  margin-bottom: 1rem;
}

.url-task-icon {
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 0.5rem;
  background-color: rgba(59, 130, 246, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
}

.url-task-icon-inner {
  color: #3b82f6;
  font-size: 1.125rem;
}

.app-dark-theme .url-task-icon-inner {
  color: #60a5fa;
}

.url-task-text {
  font-size: 1rem;
  font-weight: 600;
  opacity: 0.8;
}

/* ===== Task list ===== */
.task-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.task-item {
  position: relative;
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 0.5rem;
  background-color: transparent;
  padding: 0.75rem;
}

.app-dark-theme .task-item {
  border-color: rgba(255, 255, 255, 0.08);
}

.task-item:hover {
  background-color: rgba(0, 0, 0, 0.03);
}

.app-dark-theme .task-item:hover {
  background-color: rgba(255, 255, 255, 0.04);
}

.task-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.75rem;
}

.task-info {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  overflow: hidden;
  flex: 1;
}

.task-icon {
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 0.375rem;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.task-icon-download {
  background-color: rgba(59, 130, 246, 0.1);
  color: #3b82f6;
}

.app-dark-theme .task-icon-download {
  color: #60a5fa;
}

.task-icon-upload {
  background-color: rgba(249, 115, 22, 0.1);
  color: #f97316;
}

.app-dark-theme .task-icon-upload {
  color: #fb923c;
}

.task-details {
  min-width: 0;
  flex: 1;
  text-align: left;
}

.task-filename {
  font-weight: 600;
  font-size: 0.875rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  width: 100%;
  opacity: 0.9;
  margin-bottom: 0.25rem;
}

.task-status-text {
  font-size: 0.75rem;
  opacity: 0.4;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.task-status-error {
  color: #ef4444;
  font-weight: 700;
}

.app-dark-theme .task-status-error {
  color: #f87171;
}

.task-status-success {
  color: #22c55e;
  font-weight: 700;
}

.app-dark-theme .task-status-success {
  color: #4ade80;
}

.task-status-progress {
  font-weight: 700;
  color: #4b5563;
}

.app-dark-theme .task-status-progress {
  color: #d1d5db;
}

.task-status-total {
  opacity: 0.5;
}

.task-actions {
  text-align: right;
  margin-left: 1rem;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.task-percent {
  font-size: 0.875rem;
  font-weight: 900;
  letter-spacing: -0.05em;
}

.task-percent-error {
  color: #ef4444;
}

.task-percent-success {
  color: #22c55e;
}

.task-percent-upload {
  color: #f97316;
}

.task-percent-download {
  color: #3b82f6;
}

.task-stop-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 0.375rem;
  opacity: 0.6;
}

.task-item:hover .task-stop-button {
  opacity: 1;
}

.task-stop-button:hover {
  background-color: rgba(239, 68, 68, 0.08);
}

.task-progress-wrapper {
  margin-top: 0.75rem;
}

.task-progress {
  margin: 0;
}

/* ===== Draggable trigger button ===== */
.draggable-trigger {
  cursor: grab;
  user-select: none;
  transition: opacity 0.2s;
}

.draggable-trigger--dragging {
  cursor: grabbing;
  opacity: 0.85;
}

.draggable-trigger__body {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  background-color: rgba(255, 255, 255, 0.85);
  border: 1px solid rgba(0, 0, 0, 0.08);
  color: #111827;
}

.app-dark-theme .draggable-trigger__body {
  background-color: rgba(30, 30, 30, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #f9fafb;
}

.draggable-trigger:hover .draggable-trigger__body {
  background-color: rgba(255, 255, 255, 0.95);
}

.app-dark-theme .draggable-trigger:hover .draggable-trigger__body {
  background-color: rgba(40, 40, 40, 0.95);
}

.draggable-trigger__badge {
  position: absolute;
  top: -6px;
  right: -6px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background-color: #ff4d4f;
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  line-height: 18px;
  text-align: center;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  pointer-events: none;
}

.draggable-trigger__ripple {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 40px;
  height: 40px;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  background-color: #3b82f6;
  pointer-events: none;
  z-index: -1;
  animation: ripple-expand 0.4s ease-out forwards;
}

.app-dark-theme .draggable-trigger__ripple {
  background-color: #60a5fa;
}

@keyframes ripple-expand {
  0% {
    width: 0px;
    height: 0px;
    opacity: 0.5;
  }

  100% {
    width: 1000px;
    height: 1000px;
    opacity: 0;
  }
}

@media (max-width: 585px) {
  .draggable-trigger {
    transform: translateX(34px);
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s !important;
    opacity: 0.6;
  }

  .draggable-trigger::after {
    content: "";
    position: absolute;
    top: -10px;
    bottom: -10px;
    left: -20px;
    right: -40px;
    background: transparent;
    cursor: pointer;
  }

  .draggable-trigger:hover,
  .draggable-trigger:active {
    transform: translateX(0);
    opacity: 1;
  }
}
</style>

<style>
.frosted-popover .ant-popover-inner {
  background-color: rgba(255, 255, 255, 0.85) !important;
  border: 1px solid rgba(0, 0, 0, 0.06) !important;
  border-radius: 12px !important;
  padding: 12px !important;
  color: #111827 !important;
}

.app-dark-theme .frosted-popover .ant-popover-inner {
  background-color: rgba(20, 20, 20, 0.9) !important;
  border: 1px solid rgba(255, 255, 255, 0.08) !important;
  color: #f9fafb !important;
}

.frosted-popover .ant-popover-arrow {
  display: none !important;
}
</style>
