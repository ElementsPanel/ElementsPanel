<script setup lang="ts">
import { useAppConfigStore } from "@/stores/useAppConfigStore";
import { computed, type Component } from "vue";

const { isDarkTheme } = useAppConfigStore();

export interface DesktopIconProps {
    id: string;
    label: string;
    icon: Component | string;
    color?: string;
    selected?: boolean;
    x: number;
    y: number;
}

const props = withDefaults(defineProps<DesktopIconProps>(), {
    color: "var(--color-blue-5)",
    selected: false,
    x: 0,
    y: 0
});

const emit = defineEmits<{
    (e: "open", id: string): void;
    (e: "select", id: string): void;
    (e: "dragstart", id: string, clientX: number, clientY: number): void;
}>();

const iconStyle = computed(() => ({
    color: isDarkTheme.value ? "#fff" : "#1a1a1a"
}));

const isComponent = computed(() => typeof props.icon !== "string");

const handleDblClick = () => {
    emit("open", props.id);
};

const handleClick = () => {
    emit("select", props.id);
};

const handleMouseDown = (e: MouseEvent) => {
    emit("dragstart", props.id, e.clientX, e.clientY);
};
</script>

<template>
    <div class="desktop-icon" :class="{ 'desktop-icon--selected': selected }"
        :style="{ left: x + 'px', top: y + 'px' }" @click.stop="handleClick" @dblclick.stop="handleDblClick"
        @mousedown.stop="handleMouseDown">
        <div class="desktop-icon__graphic" :style="iconStyle">
            <component :is="icon" v-if="isComponent" class="desktop-icon__anticon" />
            <img v-else-if="typeof icon === 'string' && icon.endsWith('.svg')" :src="icon" alt="icon"
                class="desktop-icon__img" />
            <span v-else class="desktop-icon__emoji">{{ icon }}</span>
        </div>
        <span class="desktop-icon__label">{{ label }}</span>
    </div>
</template>

<style lang="scss" scoped>
.desktop-icon {
    position: absolute;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    width: 90px;
    padding: 8px 4px;
    cursor: pointer;
    border-radius: 8px;
    transition: background-color 0.15s ease;
    user-select: none;

    &:hover {
        background-color: var(--desktop-icon-hover);
    }

    &--selected {
        background-color: var(--desktop-icon-selected) !important;
        outline: 1px solid var(--desktop-icon-selected-border);
    }

    &__graphic {
        width: 52px;
        height: 52px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 42px;
        margin-bottom: 6px;
        transition: transform 0.2s ease;
        filter: drop-shadow(0 2px 4px var(--desktop-icon-shadow));
    }

    &__anticon {
        font-size: 42px;
    }

    &__img {
        width: 42px;
        height: 42px;
        object-fit: contain;
    }

    &__emoji {
        font-size: 42px;
        line-height: 1;
    }

    &__label {
        font-size: 11px;
        color: var(--desktop-icon-text);
        text-align: center;
        text-shadow: 0 1px 3px var(--desktop-icon-shadow);
        line-height: 1.3;
        max-width: 84px;
        overflow: hidden;
        text-overflow: ellipsis;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        word-break: break-word;
    }
}
</style>
