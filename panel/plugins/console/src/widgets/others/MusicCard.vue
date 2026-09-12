<!-- eslint-disable no-unused-vars -->
<script setup lang="ts">
import CardPanel from "@/components/CardPanel.vue";
import type { FrontendFileManagerService } from "@/plugin";
import { usePluginService } from "@/plugin/context";
import { useLayoutCardTools } from "@/hooks/useCardTools";
import { t } from "@/lang/i18n";
import { useAppConfigStore } from "@/stores/useAppConfigStore";
import { useAppToolsStore } from "@/stores/useAppToolsStore";
import { getRandomId } from "@/tools/randId";
import type { LayoutCard } from "@/types";
import { message } from "@/tools/vuetifyToast";
import dayjs from "dayjs";
import { onMounted, ref } from "vue";
import { VBtn, VIcon } from "vuetify/components";
import WaveSurfer from "wavesurfer.js";

const { isDarkTheme } = useAppConfigStore();

const prop = defineProps<{
  card: LayoutCard;
}>();

const { openInputDialog } = useAppToolsStore();

const { getMetaValue, setMetaValue } = useLayoutCardTools(prop.card);

const musicUrl = ref(getMetaValue<string>("musicUrl", ""));

const timeLineId = `timeline-${getRandomId()}`;

/**
 * The file picker belongs to `plugins/file`. Without it there is nothing
 * to pick a file with, so the dialog answers with an empty path and the caller's
 * existing "no path" branch takes over.
 */
const useUploadFileDialog = async () =>
  (await usePluginService<FrontendFileManagerService>("file")?.useUploadFileDialog()) ?? "";

enum UploadType {
  File = "FILE",
  Url = "URL"
}

const uploadMusic = async (type: UploadType) => {
  try {
    if (type === UploadType.File) {
      const path = await useUploadFileDialog();
      if (path) (musicUrl.value = path) && message.success(t("TXT_CODE_9d498b20"));
    }
    if (type === UploadType.Url) {
      musicUrl.value =
        ((await openInputDialog(t("TXT_CODE_f4617d31"))) as string) || musicUrl.value;
      message.success(t("TXT_CODE_9d498b20"));
    }
    setMetaValue("musicUrl", musicUrl.value);
  } catch (error: any) {}
};

let wavesurfer: WaveSurfer | null = null;

enum PlayerStatus {
  Play = "PLAY",
  Pause = "PAUSE"
}

const playerStatus = ref(PlayerStatus.Pause);
const playerButtonIcon = ref("mdi-play-circle-outline");
const changePlayerStatis = (setStatus?: PlayerStatus) => {
  if (setStatus) {
    playerStatus.value = setStatus;
  } else {
    playerStatus.value =
      playerStatus.value === PlayerStatus.Play ? PlayerStatus.Pause : PlayerStatus.Play;
  }

  if (playerStatus.value === PlayerStatus.Play) {
    wavesurfer?.play();
    playerButtonIcon.value = "mdi-pause-circle-outline";
  } else {
    wavesurfer?.pause();
    playerButtonIcon.value = "mdi-play-circle-outline";
  }
};
const playTime = ref("0:00");
const maxTime = ref("0:00");

const processingTime = (s: number = 0) => {
  const duration = dayjs.duration(s, "seconds");
  return duration.asHours() >= 1 ? duration.format("H:mm:ss") : duration.format("m:ss");
};

onMounted(() => {
  const time = document.getElementById(timeLineId);

  if (time) {
    wavesurfer = WaveSurfer.create({
      container: time || "",
      waveColor: isDarkTheme.value ? "#707070" : "#7a7a7a",
      progressColor: isDarkTheme.value ? "#bababa" : "#000",
      cursorColor: "#8f8f8f",
      url: musicUrl.value,
      height: 50,
      barWidth: 4,
      barGap: 6,
      barRadius: 8,
      cursorWidth: 2
    });

    wavesurfer.on("ready", function () {
      maxTime.value = processingTime(wavesurfer?.getDuration());
    });
    wavesurfer.on("click", () => {
      changePlayerStatis(PlayerStatus.Play);
    });
    wavesurfer.on("pause", () => {
      changePlayerStatis(PlayerStatus.Pause);
    });
    wavesurfer.on("finish", () => {
      changePlayerStatis(PlayerStatus.Play);
    });
    wavesurfer.on("timeupdate", (currentTime) => {
      playTime.value = processingTime(currentTime);
    });
  }
});
</script>

<template>
  <div class="h-100 position-relative">
    <card-panel>
      <template #title>
        {{ card.title }}
      </template>

      <template #body>
        <div v-if="musicUrl" class="h-100 flex-center">
          <div class="player">
            <div class="time-line">
              <div :id="timeLineId" class="time"></div>
            </div>
            <div class="button">
              <VBtn icon variant="text" size="large" @click="changePlayerStatis()"><VIcon :icon="playerButtonIcon" /></VBtn>
              <span>{{ playTime }}&nbsp;/&nbsp;{{ maxTime }}</span>
            </div>
          </div>
        </div>
        <div v-else>
          <div class="empty-placeholder h-100"><VIcon icon="mdi-music-off" size="32" /><span>{{ t("TXT_CODE_28ce635a") }}</span><span>{{ t("TXT_CODE_be1354f5") }}</span></div>
        </div>
      </template>
      <template #body-design>
        <div class="w-100 h-100 edit">
          <h2>{{ t("TXT_CODE_c2697552") }}</h2>
          <div class="d-flex ga-2">
            <VBtn color="primary" @click="uploadMusic(UploadType.File)">
              {{ t("TXT_CODE_a106108c") }}
            </VBtn>
            <VBtn color="primary" @click="uploadMusic(UploadType.Url)">
              {{ t("TXT_CODE_b3f2ea10") }}
            </VBtn>
          </div>
        </div>
      </template>
    </card-panel>
  </div>
</template>

<style lang="less" scoped>
.edit {
  z-index: 5;
  opacity: 0;
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  border-radius: 12px;
  background-color: rgba(0, 0, 0, 0.3);
  color: #fff;
  text-shadow: 0 0 10px #000;
  transition: all 0.1s ease-in-out;

  &:hover {
    opacity: 1;
  }
}

.player {
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  width: 86%;
  height: 100%;
  .time-line {
    width: 100%;
  }
  .button {
    margin-left: -20px;
    margin-top: 5px;
    display: flex;
    align-items: center;
  }
}
.empty-placeholder { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; }
</style>
