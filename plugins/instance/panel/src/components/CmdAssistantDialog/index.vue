<script setup lang="ts">
import { ref } from "vue";
import ActionButton from "@elementspanel/epanel-plugin-console/components/ActionButton";
import { t } from "@elementspanel/epanel-plugin-i18n";
import { QUICKSTART_ACTION_TYPE } from "@elementspanel/epanel-plugin-console/hooks/widgets/quickStartFlow";
import FadeUpAnimation from "@elementspanel/epanel-plugin-console/components/FadeUpAnimation";
import { useStartCmdBuilder } from "@elementspanel/epanel-plugin-console/hooks/useGenerateStartCmd";
import { reportErrorMsg } from "@elementspanel/epanel-plugin-console/tools/validator";
import {
  TYPE_MINECRAFT_BEDROCK,
  TYPE_MINECRAFT_JAVA,
  TYPE_STEAM_SERVER_UNIVERSAL,
  TYPE_UNIVERSAL
} from "@elementspanel/epanel-plugin-console/hooks/useInstance";
import AnyAppFormComponent from "./AnyAppForm.vue";
import MinecraftJavaForm from "./MinecraftJavaForm.vue";
import type { Component } from "vue";
import { VBtn, VCard, VCardActions, VCardText, VDialog, VRow, VSpacer, VTab, VTabs } from "vuetify/components";

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
    title: t("TXT_CODE_COMMAND_ASSISTANT_MINECRAFT_JAVA"),
    form: minecraftJava
  },
  [TYPE_MINECRAFT_BEDROCK]: {
    component: AnyAppFormComponent,
    title: t("TXT_CODE_COMMAND_ASSISTANT_MINECRAFT_BEDROCK"),
    form: anyAppForm
  },
  [TYPE_STEAM_SERVER_UNIVERSAL]: {
    component: AnyAppFormComponent,
    title: t("TXT_CODE_COMMAND_ASSISTANT_STEAM_GAME_SERVER"),
    form: anyAppForm
  },
  [TYPE_UNIVERSAL]: {
    component: AnyAppFormComponent,
    title: t("TXT_CODE_COMMON_ANY_PROGRAM"),
    form: anyAppForm
  }
};

const cancel = async () => {
  open.value = false;
  if (props.destroyComponent) props.destroyComponent();
};

const submit = async () => {
  try {
    const result = await formRef.value?.validate();
    if (!result?.valid) return reportErrorMsg(t("TXT_CODE_COMMON_PLEASE_COMPLETE_ALL_REQUIRED_FIELDS_IN_THE_FORM"));
  } catch (error: any) {
    return reportErrorMsg(t("TXT_CODE_COMMON_PLEASE_COMPLETE_ALL_REQUIRED_FIELDS_IN_THE_FORM"));
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
    title: t("TXT_CODE_COMMON_MINECRAFT_GAME_SERVER"),
    click: () => {
      setGameType(QUICKSTART_ACTION_TYPE.Minecraft);
      handleNext();
    }
  },
  {
    icon: "mdi-swap-horizontal",
    title: t("TXT_CODE_COMMAND_ASSISTANT_STEAM_GAME_SERVER"),
    click: () => {
      setGameType(QUICKSTART_ACTION_TYPE.SteamGameServer);
      handleNext();
    }
  },
  {
    icon: "mdi-dropbox",
    title: t("TXT_CODE_COMMON_ANY_CONSOLE_PROGRAM"),
    click: () => {
      setGameType(QUICKSTART_ACTION_TYPE.AnyApp);
      handleNext();
    }
  }
];
</script>

<template>
  <VDialog v-model="open" max-width="800" persistent>
    <VCard :title="t('TXT_CODE_COMMON_COMMAND_HELPER')">
      <VCardText>
      <div v-if="step === STEP.SELECT_TYPE">
        <VRow>
          <p class="text-body-medium text-medium-emphasis">
            {{ t("TXT_CODE_COMMON_PLEASE_SELECT_YOUR_SERVER_PROGRAM_TYPE") }}
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
        <VTabs v-model="appType" color="primary"><VTab :value="TYPE_STEAM_SERVER_UNIVERSAL">{{ t("TXT_CODE_COMMAND_ASSISTANT_STEAM_GAME_SERVER") }}</VTab></VTabs>
      </div>
      <div v-else-if="gameType != null">
        <VTabs v-model="appType" color="primary"><VTab :value="TYPE_UNIVERSAL">{{ t("TXT_CODE_COMMAND_ASSISTANT_ALL_TYPES") }}</VTab></VTabs>
      </div>
      <component
        :is="tabFormComponent[appType].component"
        v-if="appType && tabFormComponent[appType]?.component"
        ref="formRef"
        v-model:data="tabFormComponent[appType].form"
      />
      </VCardText>
      <VCardActions><VSpacer /><VBtn variant="text" @click="cancel">{{ t("TXT_CODE_COMMON_CANCEL") }}</VBtn><VBtn color="primary" :disabled="step !== STEP.SELECT_SOFTWARE" @click="submit">{{ t("TXT_CODE_COMMON_CONFIRM") }}</VBtn></VCardActions>
    </VCard>
  </VDialog>
</template>
