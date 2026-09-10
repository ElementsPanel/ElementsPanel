<script setup lang="ts">
import { ref, reactive, nextTick } from "vue";
import { t } from "@/lang/i18n";
import { useInstanceTags, useInstanceTagTips } from "@/hooks/useInstanceTag";
import { reportErrorMsg } from "@/tools/validator";
import { message } from "@/tools/vuetifyToast";
import {
  VBtn,
  VCard,
  VCardActions,
  VCardText,
  VCardTitle,
  VChip,
  VDialog,
  VSpacer,
  VTextField
} from "vuetify/components";

interface Props {
  destroyComponent(delay?: number): void;
  emitResult(data?: string[]): void;
  instanceId: string;
  daemonId: string;
  tags: string[];
}

const props = defineProps<Props>();

const inputRef = ref();
const state = reactive({
  inputVisible: false,
  inputValue: ""
});

const { tagTips } = useInstanceTagTips();
const { removeTag, addTag, instanceTags, saveTags, saveLoading, instanceTagsTips } =
  useInstanceTags(props.instanceId, props.daemonId, props.tags, tagTips.value);

// eslint-disable-next-line no-unused-vars
let resolve: (tags: string[]) => void;
const open = ref(false);

const handleInputConfirm = () => {
  if (state.inputValue) {
    addTag(state.inputValue);
  }
  state.inputVisible = false;
  state.inputValue = "";
};

const showInput = () => {
  state.inputVisible = true;
  nextTick(() => {
    inputRef.value.focus();
  });
};

const cancel = async () => {
  open.value = false;
  resolve(instanceTags.value);
  if (props.destroyComponent) props.destroyComponent(1000);
};

const handleDialogUpdate = (value: boolean) => {
  if (value) {
    open.value = true;
  } else if (open.value) {
    cancel();
  }
};

const submit = async () => {
  try {
    await saveTags();
    message.success(t("TXT_CODE_a7907771"));
    await cancel();
  } catch (error) {
    reportErrorMsg(error);
  }
};

const openDialog = () => {
  open.value = true;
  return new Promise<string[]>((_resolve) => {
    resolve = _resolve;
  });
};

defineExpose({ openDialog });
</script>

<template>
  <VDialog :model-value="open" class="app-dialog tags-dialog" max-width="620" scrollable
    @update:model-value="handleDialogUpdate">
    <VCard rounded="xl">
      <VCardTitle class="tags-dialog__title">{{ t("TXT_CODE_a2544278") }}</VCardTitle>
      <VCardText class="tags-dialog__content">
        <p class="tags-dialog__hint">{{ t("TXT_CODE_f84ae54f") }}</p>

        <section class="tags-dialog__section">
          <p class="tags-dialog__label">{{ t("TXT_CODE_2c1337d") }}</p>
          <p class="tags-dialog__hint">{{ t("TXT_CODE_e26d53d5") }}</p>
          <div class="tag-container">
            <VChip
              v-for="tag in instanceTags"
              :key="tag"
              class="tag-item"
              color="primary"
              variant="tonal"
              closable
              rounded="xl"
              @click:close="removeTag(tag)"
            >
              {{ tag }}
            </VChip>
            <VTextField
              v-if="state.inputVisible"
              ref="inputRef"
              v-model="state.inputValue"
              class="tag-input"
              variant="solo"
              density="compact"
              hide-details
              rounded="xl"
              @blur="handleInputConfirm"
              @keyup.enter="handleInputConfirm"
            />
            <VBtn
              v-else
              class="tag-add"
              variant="outlined"
              rounded="xl"
              prepend-icon="mdi-plus"
              @click="showInput"
            >
              {{ t("TXT_CODE_3dd66d98") }}
            </VBtn>
          </div>
        </section>

        <section v-if="instanceTagsTips?.length > 0" class="tags-dialog__section tags-dialog__suggestions">
          <p class="tags-dialog__label">{{ t("TXT_CODE_67d1ea21") }}</p>
          <p class="tags-dialog__hint">{{ t("TXT_CODE_3ecee271") }}</p>
          <div class="tag-container">
            <VChip
              v-for="tag in instanceTagsTips"
              :key="tag"
              class="tag-item tag-option"
              variant="outlined"
              rounded="xl"
              @click="addTag(tag)"
            >
              {{ tag }}
            </VChip>
          </div>
        </section>
      </VCardText>
      <VCardActions class="tags-dialog__actions">
        <VSpacer />
        <VBtn variant="text" rounded="xl" @click="cancel">{{ t("TXT_CODE_a0451c97") }}</VBtn>
        <VBtn color="primary" variant="text" rounded="xl" :loading="saveLoading" @click="submit">
          {{ t("TXT_CODE_d507abff") }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<style lang="scss" scoped>
.tag-container {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.tags-dialog__title {
  padding: 14px 24px 8px;
}

.tags-dialog__content {
  padding: 8px 24px 16px;
}

.tags-dialog__section {
  & + & {
    margin-top: 24px;
  }
}

.tags-dialog__label,
.tags-dialog__hint {
  margin: 0;
}

.tags-dialog__label {
  color: rgb(var(--v-theme-on-surface));
  font-weight: 500;
}

.tags-dialog__hint {
  color: rgba(var(--v-theme-on-surface), 0.6);
  line-height: 1.5;
}

.tags-dialog__label + .tags-dialog__hint {
  margin-top: 4px;
  margin-bottom: 10px;
}

.tag-item {
  margin: 0;
}

.tag-input {
  flex: 0 0 100px;
  max-width: 100px;
}

.tag-add {
  min-width: 0;
}

.tag-option {
  cursor: pointer;
}

.tags-dialog__actions {
  padding: 8px 16px 12px 24px;
}
</style>
