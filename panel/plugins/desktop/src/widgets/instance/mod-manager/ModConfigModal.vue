<script setup lang="ts">
import { t } from "@/lang/i18n";
import DesktopWindow from "../../desktop/DesktopWindow.vue";
import { FileTextOutlined, SettingOutlined } from "@ant-design/icons-vue";
import {
  Button,
  List,
  ListItem,
  ListItemMeta,
  Modal
} from "ant-design-vue";
import { onMounted, onUnmounted, ref } from "vue";

defineProps<{
  visible: boolean;
  currentMod: any;
  configLoading: boolean;
  configFiles: any[];
  isDesktop?: boolean;
}>();

const windowWidth = ref(window.innerWidth);
const windowHeight = ref(window.innerHeight);

const updateWindowSize = () => {
  windowWidth.value = window.innerWidth;
  windowHeight.value = window.innerHeight;
};

onMounted(() => {
  window.addEventListener('resize', updateWindowSize);
});

onUnmounted(() => {
  window.removeEventListener('resize', updateWindowSize);
});

const emit = defineEmits(["update:visible", "edit"]);
</script>

<template>
  <template v-if="isDesktop">
    <Teleport to="body">
      <Transition name="du-dialog-fade">
        <DesktopWindow v-if="visible" id="mod-config-dialog" :title="t('TXT_CODE_CONFIG') + ': ' + currentMod?.name"
          :icon="SettingOutlined" :visible="visible" :minimized="false" :maximized="false" :active="true"
          :initial-width="600" :initial-height="400" :initial-x="windowWidth / 2 - 300"
          :initial-y="windowHeight / 2 - 200" :z-index="10001" :show-minimize="false" :show-maximize="false"
          :resizable="false" @close="emit('update:visible', false)">
          <div class="desktop-modal-content">
            <List :loading="configLoading" :data-source="configFiles">
              <template #renderItem="{ item }">
                <ListItem>
                  <ListItemMeta :title="item.name" :description="item.path">
                    <template #avatar>
                      <FileTextOutlined />
                    </template>
                  </ListItemMeta>
                  <template #actions>
                    <Button type="link" @click="emit('edit', item)">{{ t("TXT_CODE_EDIT") }}</Button>
                  </template>
                </ListItem>
              </template>
            </List>
          </div>
        </DesktopWindow>
      </Transition>
    </Teleport>
  </template>
  <Modal v-else :visible="visible" @update:visible="val => emit('update:visible', val)"
    :title="t('TXT_CODE_CONFIG') + ': ' + currentMod?.name" :footer="null">
    <List :loading="configLoading" :data-source="configFiles">
      <template #renderItem="{ item }">
        <ListItem>
          <ListItemMeta :title="item.name" :description="item.path">
            <template #avatar>
              <FileTextOutlined />
            </template>
          </ListItemMeta>
          <template #actions>
            <Button type="link" @click="emit('edit', item)">{{ t("TXT_CODE_EDIT") }}</Button>
          </template>
        </ListItem>
      </template>
    </List>
  </Modal>
</template>

<style scoped>
.desktop-modal-content {
  padding: 20px;
  height: 100%;
  overflow-y: auto;
  background: var(--desktop-window-bg, #fff);
  color: var(--desktop-window-text, #000);
}

.du-dialog-fade-enter-active,
.du-dialog-fade-leave-active {
  transition: all 0.25s cubic-bezier(0.25, 0.10, 0.25, 1.00);
}

.du-dialog-fade-enter-from,
.du-dialog-fade-leave-to {
  opacity: 0;
  transform: scale(0.95);
}
</style>
