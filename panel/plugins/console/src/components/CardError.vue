<script lang="ts" setup>
import CardPanel from "@/components/CardPanel.vue";
import { t } from "@/lang/i18n";
import { useLayoutContainerStore } from "@/stores/useLayoutContainerStore";

const { containerState } = useLayoutContainerStore();
defineProps<{
  title: string;
  error: Error;
}>();
</script>

<template>
  <CardPanel>
    <template #title>{{ title }}</template>
    <template #body>
      <div class="flex justify-center align-center h-100">
        <div class="">
          <p
            v-if="containerState.showNewCardDialog"
            :level="5"
            style="max-width: 320px; margin: auto; text-align: center"
          >
            <VIcon icon="mdi-alert-circle-outline" />
            {{ t("TXT_CODE_450481c5") }}
          </p>
          <template v-else>
            <div>
              <p>
                <VIcon icon="mdi-alert-circle-outline" />
                {{ t("TXT_CODE_4e627613") }}
              </p>

              <p>
                <div>
                  {{ t("TXT_CODE_9c95b60f") }}
                </div>
                <pre>{{ error.message ? error.message : error }}</pre>
              </p>
            </div>
          </template>
        </div>
      </div>
    </template>
  </CardPanel>
</template>

<style lang="scss" scoped>
.icon {
  text-align: center;
  color: var(--color-gray-7);
}
</style>
