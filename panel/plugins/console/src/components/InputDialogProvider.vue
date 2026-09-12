<template>
  <div>
    <AppDialog v-model:visible="state.inputDialog.show" :title="state.inputDialog.title" :width="400" @ok="handleOk" @cancel="handleCancel">
      <div class="dialog-input-container">
        <VTextField v-model="inputValue" :placeholder="state.inputDialog.title" variant="solo" density="compact" hide-details />
      </div>
    </AppDialog>
  </div>
</template>
<script lang="ts" setup>
import { useAppToolsStore } from "@/stores/useAppToolsStore";
import { ref } from "vue";
import AppDialog from "./AppDialog.vue";

const inputValue = ref("");

const { state } = useAppToolsStore();

const handleOk = () => {
  state.inputDialog.resolve(JSON.parse(JSON.stringify(inputValue.value)));
  state.inputDialog.show = false;
  inputValue.value = "";
};

const handleCancel = () => {
  state.inputDialog.reject(new Error("Dialog closed by user"));
  state.inputDialog.show = false;
  inputValue.value = "";
};
</script>

<style lang="scss">
.dialog-input-container {
  margin: 20px 0px;
}
</style>
