<script setup lang="ts">
import CardPanel from "@/components/CardPanel.vue";
import { usePluginService, type FrontendTerminalService } from "@/plugin/context";
import { useLayoutCardTools } from "@/hooks/useCardTools";
import { useInstanceInfo } from "@/hooks/useInstance";
import { useOverviewInfo } from "@/hooks/useOverviewInfo";
import { t } from "@/lang/i18n";
import type { LayoutCard } from "@/types";
import { computed, onMounted } from "vue";

const props = defineProps<{
    card: LayoutCard;
}>();

const terminalService = computed(() => usePluginService<FrontendTerminalService>("terminal"));

const { getMetaOrRouteValue } = useLayoutCardTools(props.card);

const instanceId = getMetaOrRouteValue("instanceId");
const daemonId = getMetaOrRouteValue("daemonId");

const { isStopped, instanceInfo, execute } = useInstanceInfo({
    instanceId,
    daemonId,
    autoRefresh: true
});

const { state: overviewState } = useOverviewInfo();

const nodeInfo = computed(() => {
    if (!overviewState.value?.remote) return null;
    return overviewState.value.remote.find((node) => node.uuid === daemonId);
});

const displayInfo = computed(() => {
    if (instanceInfo.value?.config?.processType === "docker") {
        return instanceInfo.value?.info;
    } else {
        if (nodeInfo.value?.system) {
            const system = nodeInfo.value.system;
            const memoryUsage = system.totalmem - system.freemem;
            return {
                ...instanceInfo.value?.info,
                cpuUsage: system.cpuUsage * 100,
                memoryUsage: memoryUsage,
                memoryLimit: system.totalmem,
                memoryUsagePercent: (memoryUsage / system.totalmem) * 100
            };
        }
        return instanceInfo.value?.info;
    }
});

const isDisplayStopped = computed(() => {
    if (instanceInfo.value?.config?.processType === "docker") {
        return isStopped.value;
    }
    return false; // For non-docker, we always show node data
});

onMounted(async () => {
    if (instanceId && daemonId) {
        await execute({
            params: {
                uuid: instanceId,
                daemonId: daemonId
            }
        });
    }
});
</script>

<template>
    <CardPanel class="containerWrapper" style="height: 100%">
        <template #title>
            {{ card.title }}
        </template>
        <template #body>
            <component :is="terminalService?.TerminalTopTags" v-if="terminalService && !isDisplayStopped && displayInfo" :info="displayInfo"
                :is-stopped="isDisplayStopped" />
            <div v-else style="text-align: center; color: var(--color-gray-6); padding: 10px 0;">
                {{ t("TXT_CODE_NO_DATA") }}
            </div>
        </template>
    </CardPanel>
</template>
