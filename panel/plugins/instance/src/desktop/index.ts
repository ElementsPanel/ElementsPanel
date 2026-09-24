import { defineComponent, h, type Component } from "vue";
import type { PanelFrontendPluginContext } from "@/plugin";
import { t } from "@/lang/i18n";
import { useAppStateStore } from "@/stores/useAppStateStore";
import CreateInstancePage from "../views/CreateInstance.vue";
import DesktopInstanceManager from "./DesktopInstanceManager.vue";
import DesktopMyApps from "./DesktopMyApps.vue";
import DesktopInstanceConsole from "./DesktopInstanceConsole.vue";
import DesktopServerConfig from "./DesktopServerConfig.vue";
import DesktopSchedule from "./DesktopSchedule.vue";
import DesktopEventConfig from "./DesktopEventConfig.vue";

const withEvents = (component: Component, listeners: Record<string, unknown> = {}) =>
  defineComponent({
    inheritAttrs: false,
    emits: ["close"],
    setup(_, { attrs, emit }) {
      return () =>
        h(component, {
          ...attrs,
          ...listeners,
          onClose: () => emit("close"),
          onCreated: () => emit("close")
        });
    }
  });

export function openInstanceConsole(
  ctx: PanelFrontendPluginContext,
  instance: any,
  daemonId: string
) {
  return ctx.desktop.open({
    id: `console-${instance.instanceUuid}`,
    view: "instance-console",
    title: instance.config?.nickname,
    props: { instanceId: instance.instanceUuid, daemonId }
  });
}

/** All instance-specific desktop content and navigation belong to this plugin. */
export function registerDesktop(ctx: PanelFrontendPluginContext) {
  const { isAdmin } = useAppStateStore();
  const hasInstance = (props: Record<string, unknown>) =>
    typeof props.instanceId === "string" &&
    !!props.instanceId &&
    typeof props.daemonId === "string" &&
    !!props.daemonId;
  const open = (view: string, instanceId: string, daemonId: string, extra = {}) =>
    ctx.desktop.open({
      id: `${view}-${instanceId}`,
      view,
      props: { instanceId, daemonId, ...extra }
    });
  const openConsole = (instance: any, daemonId: string) =>
    openInstanceConsole(ctx, instance, daemonId);

  ctx.desktop.view({
    id: "server-config",
    component: DesktopServerConfig,
    title: () => t("TXT_CODE_d07742fe"),
    icon: "mdi-tune-variant",
    initialWidth: 900,
    initialHeight: 600,
    accepts: (props) => hasInstance(props) && typeof props.type === "string" && !!props.type
  });
  ctx.desktop.view({
    id: "schedule",
    component: DesktopSchedule,
    title: () => t("TXT_CODE_b7d026f8"),
    icon: "mdi-clock-outline",
    initialWidth: 700,
    initialHeight: 500,
    accepts: hasInstance
  });
  ctx.desktop.view({
    id: "event-config",
    component: DesktopEventConfig,
    title: () => t("TXT_CODE_10150756"),
    icon: "mdi-view-dashboard-outline",
    initialWidth: 500,
    initialHeight: 450,
    accepts: hasInstance
  });

  ctx.inject(["node"], (scope) => {
    const manager = withEvents(DesktopInstanceManager, {
      onOpenConsole: openConsole,
      onOpenNewInstance: () => scope.desktop.open({ id: "new-instance", view: "new-instance" })
    });
    scope.desktop.view({
      id: "instances",
      component: manager,
      title: () => t("TXT_CODE_e21473bc"),
      icon: "mdi-monitor",
      initialWidth: 980,
      initialHeight: 580,
      condition: () => isAdmin.value
    });
    scope.desktop.app({
      id: "instances",
      view: "instances",
      component: manager,
      label: () => t("TXT_CODE_e21473bc"),
      icon: "mdi-monitor",
      route: "/instances",
      condition: () => isAdmin.value,
      initialWidth: 980,
      initialHeight: 580
    });
    scope.desktop.view({
      id: "new-instance",
      component: withEvents(CreateInstancePage, { embedded: true }),
      title: () => t("TXT_CODE_DESKTOP_IM_NEW_INSTANCE"),
      icon: "mdi-monitor",
      initialWidth: 900,
      initialHeight: 680,
      condition: () => isAdmin.value
    });
  });

  ctx.inject(["user"], (scope) => {
    const apps = withEvents(DesktopMyApps, { onOpenConsole: openConsole });
    scope.desktop.view({
      id: "my-apps",
      component: apps,
      title: () => t("TXT_CODE_DESKTOP_MY_APPS"),
      icon: "mdi-view-grid-outline",
      initialWidth: 980,
      initialHeight: 580,
      condition: () => !isAdmin.value
    });
    scope.desktop.app({
      id: "my-apps",
      view: "my-apps",
      component: apps,
      label: () => t("TXT_CODE_DESKTOP_MY_APPS"),
      icon: "mdi-view-grid-outline",
      condition: () => !isAdmin.value
    });
  });

  ctx.inject(["terminal"], (scope) => {
    scope.desktop.view({
      id: "instance-console",
      title: () => t("TXT_CODE_524e3036"),
      icon: "mdi-code-tags",
      initialWidth: 1000,
      initialHeight: 650,
      accepts: hasInstance,
      component: withEvents(DesktopInstanceConsole, {
        onOpenServerConfig: (id: string, node: string, type: string) =>
          open("server-config", id, node, { type }),
        onOpenSchedule: (id: string, node: string) => open("schedule", id, node),
        onOpenEventConfig: (id: string, node: string) => open("event-config", id, node),
        onOpenInstanceAction: (action: string, id: string, node: string) =>
          scope.desktop.open({
            id: `instance-action-${action}-${id}`,
            view: `instance-action:${action}`,
            props: { instanceId: id, daemonId: node }
          })
      })
    });
  });
}
