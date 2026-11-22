import { computed, hasInjectionContext, inject, provide, type InjectionKey, type Ref } from "vue";

export interface DesktopWindowActivity {
  visible: Readonly<Ref<boolean>>;
  interacting: Readonly<Ref<boolean>>;
}

const activityKey: InjectionKey<DesktopWindowActivity> = Symbol.for(
  "elementspanel.desktop-window-activity"
);
const defaultActivity: DesktopWindowActivity = {
  visible: computed(() => true),
  interacting: computed(() => false)
};

export function useDesktopWindowActivity(): DesktopWindowActivity {
  return (hasInjectionContext() ? inject(activityKey, undefined) : undefined) ?? defaultActivity;
}

export function provideDesktopWindowActivity(activity: DesktopWindowActivity) {
  provide(activityKey, activity);
}
