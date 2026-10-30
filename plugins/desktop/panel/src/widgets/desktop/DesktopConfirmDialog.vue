<script lang="ts">
let confirmationSequence = 0;
let confirmationZIndex = 20000;
</script>

<script setup lang="ts">
import { t } from "@/lang/i18n";
import { computed, nextTick, ref, useSlots, watch } from "vue";
import { VBtn, VIcon } from "vuetify/components";
import DesktopDialog from "@/components/DesktopDialog.vue";

defineOptions({ inheritAttrs: false });

interface ConfirmAction {
  id: string;
  text: string;
  danger?: boolean;
  icon?: string;
  highlighted?: boolean;
  disabled?: boolean;
}

const props = withDefaults(defineProps<{
  modelValue: boolean;
  title?: string | null;
  message?: string;
  id?: string;
  width?: string | number;
  height?: number;
  zIndex?: number;
  danger?: boolean;
  loading?: boolean;
  disabled?: boolean;
  okText?: string;
  cancelText?: string;
  okButtonProps?: Record<string, unknown>;
  actions?: ConfirmAction[];
  showCancel?: boolean;
  closable?: boolean;
  keyboard?: boolean;
  footer?: unknown;
}>(), {
  height: 200,
  zIndex: 20000,
  showCancel: true,
  closable: true,
  keyboard: true
});

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  confirm: [];
  cancel: [];
  action: [id: string];
  "after-leave": [];
}>();

const slots = useSlots();
const instanceId = ++confirmationSequence;
const windowId = computed(() => props.id || `desktop-confirm-${instanceId}`);
const currentZIndex = ref(props.zIndex);
const focusWindow = () => {
  confirmationZIndex = Math.max(confirmationZIndex, props.zIndex) + 1;
  currentZIndex.value = confirmationZIndex;
};
const busy = computed(() => props.loading || !!props.okButtonProps?.loading);
const showFooter = computed(() => props.footer !== null && props.footer !== false);
const dialogElement = ref<{ getElement: () => HTMLElement | undefined }>();
let previousFocus: HTMLElement | null = null;

const focusDialog = () => {
  const element = dialogElement.value?.getElement();
  (element?.querySelector<HTMLElement>("[autofocus], .desktop-confirm__cancel, .desktop-confirm__button") || element)?.focus();
};
watch(() => props.modelValue, async (open) => {
  if (!open) return;
  focusWindow();
  previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  await nextTick();
  if (props.modelValue) focusDialog();
}, { immediate: true });

const cancel = () => {
  if (!props.modelValue || busy.value) return;
  emit("cancel");
  emit("update:modelValue", false);
};
const confirm = () => {
  if (!busy.value && !props.disabled && !props.okButtonProps?.disabled) emit("confirm");
};
const afterLeave = () => {
  if (previousFocus?.isConnected && (document.activeElement === document.body ||
      dialogElement.value?.getElement()?.contains(document.activeElement))) previousFocus.focus();
  emit("after-leave");
};
</script>

<template>
  <DesktopDialog :model-value="modelValue" :id="windowId" ref="dialogElement"
    :title="title || t('TXT_CODE_d507abff')" icon="mdi-alert-circle-outline"
    :width="width || 400" :height="height" :z-index="currentZIndex"
    :closable="closable && !busy" :keyboard="keyboard" :padded="false" :scrollable="false"
    class="desktop-confirm" @focus="focusWindow" @close="cancel" @after-leave="afterLeave">
    <template v-if="slots.title" #title><slot name="title" /></template>
    <div class="desktop-confirm__body">
      <VIcon icon="mdi-alert-circle-outline" class="desktop-confirm__icon" />
      <div class="desktop-confirm__message"><slot>{{ message }}</slot></div>
    </div>
    <template v-if="showFooter" #footer>
      <slot name="footer">
        <VBtn v-if="showCancel" class="desktop-confirm__button desktop-confirm__cancel" variant="text"
          :disabled="busy" @click="cancel">{{ cancelText ?? t("TXT_CODE_a0451c97") }}</VBtn>
        <template v-if="actions">
          <VBtn v-for="action in actions" :key="action.id" class="desktop-confirm__button"
            :class="{ 'desktop-confirm__button--primary': !action.danger, 'desktop-confirm__button--danger': action.danger,
              'desktop-confirm__button--highlighted': action.highlighted }"
            variant="text" :prepend-icon="action.icon" :disabled="busy || action.disabled"
            @click="emit('action', action.id)">{{ action.text }}</VBtn>
        </template>
        <VBtn v-else v-bind="okButtonProps" class="desktop-confirm__button"
          :class="danger ? 'desktop-confirm__button--danger' : 'desktop-confirm__button--primary'"
          variant="text" :loading="busy" :disabled="disabled || !!okButtonProps?.disabled"
          @click="confirm">{{ okText ?? t("TXT_CODE_d507abff") }}</VBtn>
      </slot>
    </template>
  </DesktopDialog>
</template>

<style lang="scss" scoped>

.desktop-confirm__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: safe center;
  gap: 12px;
  padding: 16px 20px;
}
.desktop-confirm__icon {
  flex-shrink: 0;
  font-size: 36px;
  color: var(--color-warning, #faad14);
}
.desktop-confirm__message {
  width: 100%;
  color: var(--desktop-window-text);
  font-size: 14px;
  text-align: center;
  line-height: 1.6;
  overflow-wrap: anywhere;
  :deep(p) { margin: 0; }
}

.desktop-confirm__button {
  padding: 7px 16px;
  border: none;
  font-size: 13px;
  color: var(--desktop-window-text);
  background: var(--desktop-window-titlebar-bg);
  &--primary { background: var(--color-blue-5, #1677ff); color: #fff; }
  &--danger { background: var(--color-red-5, #ff4d4f); color: #fff; }
  &--highlighted { outline: 2px solid var(--desktop-window-text); outline-offset: 2px; }
}
</style>
