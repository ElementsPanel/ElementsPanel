<script setup lang="ts">
import { ref } from "vue";
import type { MountComponent } from "../../types";
import AppDialog from "@/components/AppDialog.vue";

interface Props extends MountComponent {
  title: string;
  text: string;
  subTitle?: string;
}

const props = defineProps<Props>();

const open = ref(true);

const cancel = async () => {
  open.value = false;
  if (props.destroyComponent) props.destroyComponent();
};

defineExpose({
  cancel
});
</script>

<template>
  <AppDialog v-model:visible="open" width="600px" :title="props.title" :mask-closable="false" :closable="false" :footer="null" @cancel="cancel">
    <div class="dialog-overflow-container">
      <div class="flex flex-center">
        <div>
          <div>
            <h3>
              <div class="flex flex-center mb-20">
                <VProgressCircular indeterminate :size="60" />
              </div>
              <div class="flex flex-center" style="gap: 10px">
                {{ props.text }}
              </div>
            </h3>
            <span v-if="props.subTitle">
              <div
                class="flex-center"
                style="font-size: 12px; opacity: 0.8; max-width: 300px; text-align: center"
              >
                {{ props.subTitle }}
              </div>
            </span>
          </div>
        </div>
      </div>
    </div>
  </AppDialog>
</template>
