import { computed, onScopeDispose, ref, watch, type Ref } from "vue";
import { t } from "@/lang/i18n";
import type { MinecraftServerSelection } from "../../../../../common/src/minecraft";
import { minecraftBuilds, minecraftServers, minecraftVersions } from "../api";
import { defaultMinecraftServer, minecraftServersForType } from "../minecraft";

export function useMinecraftDownload(instanceType: Readonly<Ref<string>>) {
  const servers = ref<string[]>([]);
  const versions = ref<string[]>([]);
  const builds = ref<string[]>([]);
  const server = ref("");
  const version = ref("");
  const build = ref("");
  const description = ref("");
  const loading = ref<"servers" | "versions" | "builds" | "">("");
  const error = ref("");
  let generation = 0;
  let controller: AbortController | undefined;
  let retryAction = () => loadServers();

  async function request(
    stage: typeof loading.value,
    action: (signal: AbortSignal, current: () => boolean) => Promise<void>
  ) {
    controller?.abort();
    controller = new AbortController();
    const id = ++generation;
    const current = () => id === generation;
    loading.value = stage;
    error.value = "";
    try {
      await action(controller.signal, current);
    } catch (reason: any) {
      if (current()) error.value = reason?.message || t("TXT_CODE_minecraft.sourceError");
    } finally {
      if (current()) loading.value = "";
    }
  }

  async function loadServers() {
    loading.value = "servers";
    servers.value = [];
    versions.value = [];
    builds.value = [];
    server.value = version.value = build.value = description.value = "";
    retryAction = loadServers;
    await request("servers", async (signal, current) => {
      const result = await minecraftServers().execute({ signal });
      if (!current()) return;
      servers.value = minecraftServersForType(result.value || [], instanceType.value);
      if (!servers.value.length) throw new Error(t("TXT_CODE_minecraft.noServers"));
      await selectServer(defaultMinecraftServer(servers.value, instanceType.value));
    });
  }

  async function selectServer(value: string) {
    loading.value = "versions";
    server.value = servers.value.includes(value) ? value : "";
    version.value = build.value = description.value = "";
    versions.value = [];
    builds.value = [];
    retryAction = () => selectServer(server.value);
    await request("versions", async (signal, current) => {
      if (!server.value) return;
      const result = await minecraftVersions().execute({
        params: { server: server.value },
        signal
      });
      if (!current()) return;
      versions.value = result.value?.versions || [];
      description.value = result.value?.description || "";
      if (!versions.value.length) throw new Error(t("TXT_CODE_minecraft.noVersions"));
      await selectVersion(versions.value[0]);
    });
  }

  async function selectVersion(value: string) {
    loading.value = "builds";
    version.value = versions.value.includes(value) ? value : "";
    build.value = "";
    builds.value = [];
    retryAction = () => selectVersion(version.value);
    await request("builds", async (signal, current) => {
      if (!version.value) return;
      const result = await minecraftBuilds().execute({
        params: { server: server.value, version: version.value },
        signal
      });
      if (!current()) return;
      builds.value = result.value || [];
      if (!builds.value.length) throw new Error(t("TXT_CODE_minecraft.noVersions"));
      build.value = builds.value.includes("latest") ? "latest" : builds.value[0];
    });
  }

  const selection = computed<MinecraftServerSelection | undefined>(() => {
    if (
      loading.value ||
      error.value ||
      !servers.value.includes(server.value) ||
      !versions.value.includes(version.value) ||
      !builds.value.includes(build.value)
    )
      return undefined;
    return { server: server.value, version: version.value, build: build.value };
  });

  watch(instanceType, loadServers, { immediate: true, flush: "sync" });
  onScopeDispose(() => {
    generation++;
    controller?.abort();
  });

  return {
    servers,
    versions,
    builds,
    server,
    version,
    build,
    description,
    loading,
    error,
    selection,
    selectServer,
    selectVersion,
    retry: () => retryAction()
  };
}
