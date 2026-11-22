<script setup lang="ts">
import { t } from "@elementspanel/epanel-plugin-i18n";
import { computed, getCurrentInstance, ref, useAttrs, useSlots, watch, type VNodeChild } from "vue";
import { VBtn, VCard, VCardActions, VCardText, VDialog } from "vuetify/components";

defineOptions({ inheritAttrs: false });

interface Props {
  modelValue?: boolean;
  open?: boolean;
  visible?: boolean;
  title?: string | null;
  width?: string | number;
  maxWidth?: string | number;
  footer?: VNodeChild;
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
  // Explicit undefined defaults prevent Boolean prop casting from masking the active v-model.
  modelValue: undefined,
  open: undefined,
  visible: undefined,
  title: undefined,
  width: undefined,
  maxWidth: undefined,
  footer: undefined,
  okText: undefined,
  cancelText: undefined,
  okColor: undefined,
  okType: undefined,
  okButtonProps: undefined,
  wrapClassName: undefined,
  style: undefined,
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

// Inspect supplied props to distinguish an omitted Boolean channel from an explicit false value.
const hasVnodeProp = (name: string) =>
  Object.prototype.hasOwnProperty.call(instance?.vnode.props ?? {}, name);

const sourceOpen = computed(() => {
  if (hasVnodeProp("open")) return props.open ?? false;
  if (hasVnodeProp("visible")) return props.visible ?? false;
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

// Set only a maximum width to preserve Vuetify's viewport margins.
const dialogMaxWidth = computed(() => {
  const width = props.maxWidth ?? props.width;
  if (width == null) return props.compact ? "460px" : "1120px";
  if (props.wrapClassName?.split(/\s+/).includes("full-modal")) return width;
  return typeof width === "number" ? `${width}px` : width;
});
const dialogStyle = computed(() => [attrs.style as any, props.style] as any);

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
  <VDialog
    v-model="isOpen"
    class="app-dialog"
    :class="[attrs.class, props.wrapClassName]"
    :style="dialogStyle"
    :max-width="dialogMaxWidth"
    :persistent="props.maskClosable === false"
    :close-on-back="props.keyboard !== false"
    @after-leave="afterLeave"
  >
    <VCard v-if="renderCard" :title="props.title || undefined" class="app-dialog-card" rounded="xl">
      <template v-if="slots.title" #title>
        <slot name="title" />
      </template>

      <VCardText class="app-dialog-content">
        <slot />
      </VCardText>

      <VCardActions v-if="showFooter" class="app-dialog-actions">
        <slot name="footer">
          <VBtn v-if="props.showCancel" variant="text" @click="close">
            {{ props.cancelText ?? t("TXT_CODE_COMMON_CANCEL") }}
          </VBtn>
          <VBtn v-bind="okButtonAttrs" :loading="props.confirmLoading" @click="confirm">
            {{ props.okText ?? t("TXT_CODE_COMMON_CONFIRM") }}
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

.app-dialog-actions {
  justify-content: flex-end;
  gap: 8px;
}
</style>
