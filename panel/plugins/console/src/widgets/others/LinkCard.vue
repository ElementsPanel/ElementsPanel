<script setup lang="ts">
import { ref } from "vue";
import type { Ref } from "vue";
import ActionButton from "@/components/ActionButton.vue";
import CardPanel from "@/components/CardPanel.vue";
import AppDialog from "@/components/AppDialog.vue";
import { message } from "@/tools/vuetifyToast";
import { reportErrorMsg } from "@/tools/validator";
import { VBtn, VIcon, VRow, VTextarea } from "vuetify/components";
import { Modal } from "@/tools/vuetifyModal";

import { $t as t } from "@/lang/i18n";
import { useLayoutCardTools } from "@/hooks/useCardTools";
import { useLayoutContainerStore } from "@/stores/useLayoutContainerStore";

import type { LayoutCard } from "@/types/index";

interface LinkCardType {
  title: string;
  link: string;
}

const props = defineProps<{
  card: LayoutCard;
}>();

const { getMetaValue, setMetaValue } = useLayoutCardTools(props.card);
const { containerState } = useLayoutContainerStore();

const cardData: Ref<LinkCardType[]> = ref(
  getMetaValue("linkCardData", [
    {
      title: t("TXT_CODE_458c34db"),
      link: "https://example.com/"
    }
  ])
);

const addLink = ref({
  show: false,
  title: "",
  link: "",
  close: () => {
    addLink.value.title = "";
    addLink.value.link = "";
  },
  finish: () => {
    if (addLink.value.title == "" || addLink.value.link == "")
      return reportErrorMsg(t("TXT_CODE_633415e2"));
    cardData.value.push({
      title: addLink.value.title,
      link: addLink.value.link
    });
    setMetaValue("linkCardData", cardData.value);
    message.success(t("TXT_CODE_db14fb46"));
    addLink.value.close();
    addLink.value.show = false;
  }
});

const openLink = (url: string) => {
  window.open(url, "_blank");
};

const deleteLink = (index: number) => {
  cardData.value.splice(index, 1);
};

const confirmDeleteLink = (index: number) => {
  Modal.confirm({ title: t("TXT_CODE_6f12aba3"), onOk: () => deleteLink(index) });
};
</script>

<template>
  <card-panel>
    <template #title>
      <div class="flex">
        {{ card.title }}
      </div>
    </template>
    <template #operator>
      <div v-if="containerState.isDesignMode" class="btn-group ml-10">
        <VBtn color="primary" size="small" @click="addLink.show = true">
          {{ t("TXT_CODE_a1d885c1") }}
        </VBtn>
      </div>
    </template>

    <template #body>
      <VRow dense>
        <div v-for="(item, index) in cardData" :key="item.title" class="h-100 w-100 button">
          <div v-if="containerState.isDesignMode" class="delete-button" @click="confirmDeleteLink(index)"><VIcon icon="mdi-delete-outline" /></div>
          <action-button :title="item.title" :click="() => openLink(item.link)" />
        </div>
      </VRow>
    </template>
  </card-panel>

  <AppDialog v-model:visible="addLink.show" :title="t('TXT_CODE_a7c85e67')" @ok="addLink.finish()" @cancel="addLink.close()">
    <VTextarea
      v-model:value="addLink.title"
      :placeholder="t('TXT_CODE_b5a0661a')"
      auto-size
      class="mt-10 mb-10"
    />
    <VTextarea v-model="addLink.link" :placeholder="t('TXT_CODE_ad5e2b0f')" auto-grow />
  </AppDialog>
</template>

<style scoped lang="scss">
.button {
  position: relative;
  .delete-button {
    cursor: pointer;
    z-index: 9;
    position: absolute;
    right: 15px;
    padding: 3px;
    top: calc(50% - 13px);
    scale: 1.2;
    transition: all 0.5s;

    &:hover {
      scale: 1.3;
      background-color: rgba(0, 0, 0, 0.05);
    }
  }
}
</style>
