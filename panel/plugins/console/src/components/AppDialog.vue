<script setup lang="ts">
import { t } from "@/lang/i18n";
import { computed, getCurrentInstance, ref, useAttrs, useSlots, watch } from "vue";
import {
  VBtn,
  VCard,
  VCardActions,
  VCardText,
  VCardTitle,
  VDialog
} from "vuetify/components";

defineOptions({ inheritAttrs: false });

interface Props {
  modelValue?: boolean;
  open?: boolean;
  visible?: boolean;
  title?: string | null;
  width?: string | number;
  maxWidth?: string | number;
  footer?: unknown;
  closable?: boolean;
  maskClosable?: boolean;
  keyboard?: boolean;
  destroyOnClose?: boolean;
  confirmLoading?: boolean;
  okText?: string;
  cancelText?: string;
  showCancel?: boolean;
  okColor?: string;
  okType?: string;
  okButtonProps?: Record<string, unknown>;
  compact?: boolean;
  wrapClassName?: string;
  style?: string | Record<string, string | number>;
}

const props = withDefaults(defineProps<Props>(), {
  // Explicit undefined defaults prevent Vue's Boolean prop casting from
  // turning omitted channels into `false` and masking the active v-model.
  modelValue: undefined,
  open: undefined,
  visible: undefined,
  closable: true,
  maskClosable: true,
  keyboard: true,
  destroyOnClose: false,
  confirmLoading: false,
  showCancel: true
});

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  "update:open": [value: boolean];
  "update:visible": [value: boolean];
  ok: [];
  cancel: [];
  close: [];
  "after-close": [];
}>();

const attrs = useAttrs();
const slots = useSlots();
const localOpen = ref(false);
const instance = getCurrentInstance();

// Boolean props are cast to `false` when omitted. Inspect the vnode to tell
// which v-model channel the caller supplied, so an omitted `open` prop cannot
// mask a `modelValue` controlled by the parent.
const hasVnodeProp = (name: string) =>
  Object.prototype.hasOwnProperty.call(instance?.vnode.props ?? {}, name);

const sourceOpen = computed(() => {
  if (hasVnodeProp("open")) return props.open;
  if (hasVnodeProp("visible")) return props.visible;
  return props.modelValue ?? false;
});
const renderCard = ref(!props.destroyOnClose || sourceOpen.value);

watch(
  sourceOpen,
  (value) => {
    localOpen.value = value;
    if (value) renderCard.value = true;
  },
  { immediate: true }
);

const isOpen = computed({
  get: () => localOpen.value,
  set: (value: boolean) => {
    const wasOpen = localOpen.value;
    localOpen.value = value;
    emit("update:modelValue", value);
    emit("update:open", value);
    emit("update:visible", value);
    if (wasOpen && !value) {
      emit("cancel");
      emit("close");
    }
  }
});

const dialogWidth = computed(() => {
  const width = props.width ?? props.maxWidth;
  return typeof width === "number" ? `${width}px` : width;
});

const normalizeDialogSize = (value: string | number) => {
  const size = typeof value === "number" ? `${value}px` : value;
  if (size === "auto") return "min(960px, calc(100vw - 48px))";
  if (size === "fit-content") return size;
  return `min(${size}, calc(100vw - 48px))`;
};

// Let content determine the width for regular dialogs. Confirm dialogs stay
// compact, while explicit widths remain useful for data-heavy dialogs.
const dialogMaxWidth = computed(() => {
  const width = props.maxWidth ?? props.width;
  if (width == null) {
    return props.compact ? "min(460px, calc(100vw - 48px))" : "min(1120px, calc(100vw - 48px))";
  }
  if (props.wrapClassName?.split(/\s+/).includes("full-modal")) return width;
  return normalizeDialogSize(width);
});
const dialogStyle = computed(() => [attrs.style as any, props.style] as any);

const showTitle = computed(() => Boolean(props.title || slots.title));
const showFooter = computed(() => props.footer !== null && props.footer !== false);
const okButtonAttrs = computed(() => {
  const buttonProps = { ...(props.okButtonProps ?? {}) };
  delete buttonProps.danger;
  return {
    ...buttonProps,
    color: props.okColor ?? (props.okType === "danger" ? "error" : "primary")
  };
});

const close = () => {
  isOpen.value = false;
};

const confirm = () => {
  emit("ok");
};

const afterLeave = () => {
  if (props.destroyOnClose) renderCard.value = false;
  emit("after-close");
};
</script>

<template>
  <VDialog v-model="isOpen" class="app-dialog" :class="[attrs.class, props.wrapClassName]" :style="dialogStyle"
    :width="dialogWidth" :max-width="dialogMaxWidth" :persistent="props.maskClosable === false"
    :close-on-back="props.keyboard !== false" @after-leave="afterLeave">
    <VCard v-if="renderCard" class="app-dialog-card" rounded="xl" :style="{ width: dialogWidth }">
      <VCardTitle v-if="showTitle" class="app-dialog-title">
        <slot name="title">{{ props.title }}</slot>
      </VCardTitle>

      <VCardText class="app-dialog-content">
        <slot />
      </VCardText>

      <VCardActions v-if="showFooter" class="app-dialog-actions">
        <slot name="footer">
          <VBtn v-if="props.showCancel" variant="text" @click="close">
            {{ props.cancelText ?? t("TXT_CODE_a0451c97") }}
          </VBtn>
          <VBtn v-bind="okButtonAttrs" :loading="props.confirmLoading" @click="confirm">
            {{ props.okText ?? t("TXT_CODE_d507abff") }}
          </VBtn>
        </slot>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<style lang="scss">
.app-dialog-card {
  max-width: 100%;
  overflow: hidden;
}

.app-dialog-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 28px 8px 24px;
}

.app-dialog-content {
  padding: 12px 28px 24px;
}

.app-dialog-actions {
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px 16px 28px;
}
</style>
