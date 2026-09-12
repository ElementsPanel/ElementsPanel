<script setup lang="ts">
import { ref } from "vue";
import ActionButton from "@/components/ActionButton.vue";
import { t } from "@/lang/i18n";
import { QUICKSTART_ACTION_TYPE } from "@/hooks/widgets/quickStartFlow";
import FadeUpAnimation from "@/components/FadeUpAnimation.vue";
import { useStartCmdBuilder } from "@/hooks/useGenerateStartCmd";
import { reportErrorMsg } from "@/tools/validator";
import {
  TYPE_MINECRAFT_BEDROCK,
  TYPE_MINECRAFT_JAVA,
  TYPE_STEAM_SERVER_UNIVERSAL,
  TYPE_UNIVERSAL
} from "@/hooks/useInstance";
import AnyAppFormComponent from "./AnyAppForm.vue";
import MinecraftJavaForm from "./MinecraftJavaForm.vue";
import type { Component } from "vue";
import { VBtn, VCard, VCardActions, VCardText, VCardTitle, VDialog, VRow, VSpacer, VTab, VTabs } from "vuetify/components";

const { minecraftJava, buildCmd, setGameType, gameType, appType, anyAppForm } =
  useStartCmdBuilder();

enum STEP {
  SELECT_TYPE = "A",
  SELECT_SOFTWARE = "B"
}

interface Props {
  destroyComponent(delay?: number): void;
  emitResult(data?: string): void;
}

const props = defineProps<Props>();
const open = ref(true);
const step = ref<STEP>(STEP.SELECT_TYPE);
const formRef = ref();

const tabFormComponent: Record<string, { component: Component; title: string; form: any }> = {
  [TYPE_MINECRAFT_JAVA]: {
    component: MinecraftJavaForm,
    title: t("TXT_CODE_95583336"),
    form: minecraftJava
  },
  [TYPE_MINECRAFT_BEDROCK]: {
    component: AnyAppFormComponent,
    title: t("TXT_CODE_28116f29"),
    form: anyAppForm
  },
  [TYPE_STEAM_SERVER_UNIVERSAL]: {
    component: AnyAppFormComponent,
    title: t("TXT_CODE_dd8d27ce"),
    form: anyAppForm
  },
  [TYPE_UNIVERSAL]: {
    component: AnyAppFormComponent,
    title: t("TXT_CODE_10693964"),
    form: anyAppForm
  }
};

const cancel = async () => {
  open.value = false;
  if (props.destroyComponent) props.destroyComponent();
};

const submit = async () => {
  try {
    await formRef.value.validate();
  } catch (error: any) {
    return reportErrorMsg(t("TXT_CODE_d6c5a7f8"));
  }
  const command = buildCmd();

  if (props.emitResult) props.emitResult(command);
  await cancel();
};

const handleNext = () => {
  if (step.value === STEP.SELECT_TYPE) {
    step.value = STEP.SELECT_SOFTWARE;
  }
};

const actions = [
  {
    icon: "mdi-hammer-wrench",
    title: t("TXT_CODE_f2deb1d0"),
    click: () => {
      setGameType(QUICKSTART_ACTION_TYPE.Minecraft);
      handleNext();
    }
  },
  {
    icon: "mdi-swap-horizontal",
    title: t("TXT_CODE_dd8d27ce"),
    click: () => {
      setGameType(QUICKSTART_ACTION_TYPE.SteamGameServer);
      handleNext();
    }
  },
  {
    icon: "mdi-dropbox",
    title: t("TXT_CODE_4600deb7"),
    click: () => {
      setGameType(QUICKSTART_ACTION_TYPE.AnyApp);
      handleNext();
    }
  }
];
</script>

<template>
  <VDialog v-model="open" max-width="800" persistent>
    <VCard>
      <VCardTitle>{{ t("TXT_CODE_2728d0d4") }}</VCardTitle>
      <VCardText>
      <div v-if="step === STEP.SELECT_TYPE">
        <VRow>
          <p class="text-body-2 text-medium-emphasis">
            {{ t("TXT_CODE_18df7f10") }}
          </p>
          <fade-up-animation>
            <action-button
              v-for="(action, index) in actions"
              :key="action.title"
              :title="action.title"
              :click="actions[index].click"
              :icon="action.icon"
              :data-index="index"
            />
          </fade-up-animation>
        </VRow>
      </div>
      <div v-if="gameType === QUICKSTART_ACTION_TYPE.Minecraft">
        <VTabs v-model="appType" color="primary">
          <VTab
            v-for="typeName in [TYPE_MINECRAFT_JAVA, TYPE_MINECRAFT_BEDROCK]"
            :key="typeName" :value="typeName">{{ tabFormComponent[typeName].title }}</VTab>
        </VTabs>
      </div>
      <div v-else-if="gameType === QUICKSTART_ACTION_TYPE.SteamGameServer">
        <VTabs v-model="appType" color="primary"><VTab :value="TYPE_STEAM_SERVER_UNIVERSAL">{{ t("TXT_CODE_dd8d27ce") }}</VTab></VTabs>
      </div>
      <div v-else-if="gameType != null">
        <VTabs v-model="appType" color="primary"><VTab :value="TYPE_UNIVERSAL">{{ t("TXT_CODE_feab659d") }}</VTab></VTabs>
      </div>
      <component
        :is="tabFormComponent[appType].component"
        v-if="appType && tabFormComponent[appType]?.component"
        ref="formRef"
        v-model:data="tabFormComponent[appType].form"
      />
      </VCardText>
      <VCardActions><VSpacer /><VBtn variant="text" @click="cancel">{{ t("TXT_CODE_a0451c97") }}</VBtn><VBtn color="primary" :disabled="step !== STEP.SELECT_SOFTWARE" @click="submit">{{ t("TXT_CODE_d507abff") }}</VBtn></VCardActions>
    </VCard>
  </VDialog>
</template>

<style lang="scss" scoped></style>
