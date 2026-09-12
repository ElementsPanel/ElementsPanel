<script setup lang="ts">
import LayoutCardComponent from "@/components//LayoutCard.vue";
import { ROLE } from "@/config/router";
import { t } from "@/lang/i18n";
import { useCardPool } from "@/stores/useCardPool";
import { useLayoutConfigStore } from "@/stores/useLayoutConfig";
import { useLayoutContainerStore } from "@/stores/useLayoutContainerStore";
import { reportErrorMsg } from "@/tools/validator";
import { NEW_CARD_TYPE } from "@/types";
import { computed, ref } from "vue";
import { useRoute } from "vue-router";
import { VAlert, VBtn, VBtnToggle, VChip, VCol, VIcon, VRow } from "vuetify/components";
import type { NewCardItem } from "../../config/index";
import Params from "./params.vue";

const { getCardPool } = useCardPool();
const { insertLayoutItem } = useLayoutConfigStore();
const { containerState } = useLayoutContainerStore();

const route = useRoute();

const cardPool = computed(() =>
  getCardPool()
    .filter((v) => (v.onlyPath ? v.onlyPath.includes(route.path) : true))
    .filter((v) => !v.disableAdd)
);

const display = computed(() => containerState.showNewCardDialog);

const paramsDialog = ref<InstanceType<typeof Params>>();

const currentPageRole = route.meta.permission as ROLE;

const insertCardToLayout = async (card: NewCardItem) => {
  if (card.permission > currentPageRole) {
    return reportErrorMsg(t("TXT_CODE_fb4cb9cb"));
  }

  if (card.params) {
    const isParamsOk = await paramsDialog.value?.openDialog(card);
    if (!isParamsOk) return;
  }

  const newCard = JSON.parse(JSON.stringify(card));
  insertLayoutItem("", newCard);
  containerState.showNewCardDialog = false;
};

const cardCategoryList = [
  {
    label: t("TXT_CODE_6e23c48"),
    value: NEW_CARD_TYPE.COMMON
  },
  {
    label: t("TXT_CODE_41406a5f"),
    value: NEW_CARD_TYPE.DATA
  },
  {
    label: t("TXT_CODE_d941eb89"),
    value: NEW_CARD_TYPE.INSTANCE
  },
  // {
  //   label: t("TXT_CODE_765d34e6"),
  //   value: NEW_CARD_TYPE.USER
  // },
  {
    label: t("TXT_CODE_76b2a495"),
    value: NEW_CARD_TYPE.OTHER
  }
];

const currentCardCategory = ref<NEW_CARD_TYPE>(NEW_CARD_TYPE.COMMON);
</script>

<template>
  <Transition name="global-action-float">
    <div v-if="display" class="new-card-list-container">
      <div class="new-card-list">
        <div class="mb-24">
          <VBtnToggle v-model="currentCardCategory" color="primary" divided mandatory rounded="xl">
            <VBtn v-for="item in cardCategoryList" :key="item.value" :value="item.value" variant="tonal">
              {{ item.label }}
            </VBtn>
          </VBtnToggle>
          <VBtn class="ml-2" variant="text" @click="() => (containerState.showNewCardDialog = false)">
            <VIcon start icon="mdi-close" />
            {{ t("TXT_CODE_a7e9d4e") }}
          </VBtn>
        </div>
        <div v-for="card in cardPool" :key="card.id + currentCardCategory">
          <VRow v-if="card.category === currentCardCategory" class="mb-12">
            <VCol cols="12">
                <h4 class="text-h6 mb-2"><VIcon icon="mdi-view-grid-outline" class="mr-1" />
                  <span class="ml-4">
                    {{ card.title }}
                  </span>
                </h4>
                <p class="text-body-2 mb-2">
                  <div>
                    {{ t("TXT_CODE_8575f7c") }}
                    <VChip v-if="card.permission >= ROLE.ADMIN" color="error" size="small" variant="tonal">
                      {{ t("TXT_CODE_cd978243") }}
                    </VChip>
                    <VChip v-else-if="card.permission >= ROLE.USER" color="success" size="small" variant="tonal">
                      {{ t("TXT_CODE_b67197fc") }}
                    </VChip>
                    <VChip v-else color="success" size="small" variant="tonal">
                      {{ t("TXT_CODE_b488372f") }}
                    </VChip>
                  </div>
                </p>
                <p class="text-body-2 text-medium-emphasis">
                  <div>
                    {{ t("TXT_CODE_d486a561") }}
                    {{ card.description }}
                  </div>
                </p>
            </VCol>
            <VCol cols="12" :lg="card.width * 2">
              <div class="card-container-wrapper">
                <div v-if="card.permission > currentPageRole" class="card-alert">
                  <VAlert type="warning" variant="tonal" :text="t('TXT_CODE_cd8cd5d2')" />
                </div>
                <LayoutCardComponent
                  :id="'card-card-container-' + card.id"
                  class="card-list-container"
                  :data-id="card.id"
                  :card="card"
                  :style="{ height: card.height }"
                  @click="() => insertCardToLayout(card)"
                />
              </div>
            </VCol>
          </VRow>
        </div>
      </div>
    </div>
  </Transition>

  <Params ref="paramsDialog" />
</template>

<style lang="scss" scoped>
@import "@/assets/global.scss";
.card-alert {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  right: 20px;
  left: 20px;
  z-index: 999;
}
.new-card-list-tabs {
  z-index: 999;
  position: fixed;
  right: 24px;
  top: 24px;
  background-color: var(--new-card-list-background-color-menu);
  backdrop-filter: saturate(180%) blur(20px);
  padding: 16px 0px;
  border-radius: 6px;
  border: 1px dashed var(--gray-border-color);
}
.card-container-wrapper {
  border: 1px dashed var(--gray-border-color);
  border-radius: 12px;
  padding: 16px;
  overflow: auto;
}
.new-card-list-container {
  position: fixed;
  right: 0px;
  bottom: 0px;
  top: 60px;
  left: 0px;
  padding: 24px;

  background-color: var(--new-card-list-background-color);
  backdrop-filter: saturate(180%) blur(20px);
  z-index: 998;
  overflow-y: auto;

  .new-card-list {
    margin: auto;
    max-width: var(--app-max-width);
  }

  .card-list-container {
    cursor: pointer;
  }
  .card-list-container:hover {
    opacity: 0.8;
  }
}
</style>
