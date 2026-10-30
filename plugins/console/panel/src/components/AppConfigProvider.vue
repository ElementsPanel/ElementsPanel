<script setup lang="ts">
import { useAppConfigStore } from "@/stores/useAppConfigStore";
import dayjs from "dayjs";
import "dayjs/locale/en";
import "dayjs/locale/zh-cn";
import duration from "dayjs/plugin/duration";

dayjs.extend(duration);

const { getCurrentLanguage } = useAppConfigStore();

// init language with lib
if (getCurrentLanguage().toLowerCase() === "zh_cn") {
  dayjs.locale("zh-cn");
} else {
  dayjs.locale("en-us");
}
</script>

<template>
  <slot></slot>
</template>
