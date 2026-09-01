import { Service, type Context } from "cordis";
import { markRaw, shallowReactive, shallowRef, type App, type Component } from "vue";
import { remove } from "cosmokit";
import type { Pinia } from "pinia";
import type { RouteRecordRaw } from "vue-router";
import { LAYOUT_CARD_TYPES, PLUGIN_LAYOUT_CARD_POOL_FACTORIES } from "@/config";
import type { LayoutCardPoolItemFactory } from "@/config";
import { router } from "@/config/router";
import { getI18nInstance } from "@/lang/i18n";
import type {
  FrontendActionsService,
  FrontendDesktopService,
  FrontendI18nService,
  FrontendMenusService,
  FrontendRoutesService,
  FrontendUiService,
  FrontendVueService,
  PanelFrontendAppMenu,
  PanelFrontendDesktopApp,
  PanelFrontendInstanceAction,
  PanelFrontendLoginAction,
  PanelFrontendScheduleAction,
  PanelFrontendTerminalAction,
  PanelFrontendTerminalActionContext
} from "./context";

/**
 * The frontend's core services.
 *
 * Every method that accepts a registration wraps it in `this.ctx.effect()`, so
 * the registration belongs to the plugin that made the call and is undone when
 * that plugin unloads. The underlying stores stay `shallowReactive` so Vue
 * re-renders on every such change.
 *
 * A cordis `Context` is itself a `Proxy`; the Vue app, pinia and router are
 * stored `markRaw` so Vue never tries to make one reactive.
 */

export class VueService extends Service implements FrontendVueService {
  readonly app: App;
  readonly pinia: Pinia;
  readonly router = markRaw(router);

  constructor(ctx: Context, options: { app: App; pinia: Pinia }) {
    super(ctx, "vue", true);
    this.app = markRaw(options.app);
    this.pinia = markRaw(options.pinia);
  }
}

interface LocaleRegistration {
  locale: string;
  messages: Record<string, unknown>;
}

function cloneMessages<T>(value: T): T {
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value)) as T;
}

export class I18nService extends Service implements FrontendI18nService {
  private readonly base = new Map<string, Record<string, unknown>>();
  private readonly registrations: LocaleRegistration[] = [];

  constructor(ctx: Context) {
    super(ctx, "i18n", true);
  }

  get instance() {
    return getI18nInstance();
  }

  define(messages: Record<string, Record<string, unknown>>) {
    const added = Object.entries(messages ?? {}).map(([locale, resources]) => ({
      locale,
      messages: cloneMessages(resources)
    }));
    return this.ctx.effect(() => {
      for (const registration of added) {
        if (!this.base.has(registration.locale)) {
          this.base.set(
            registration.locale,
            cloneMessages(
              (getI18nInstance().global as any).getLocaleMessage(registration.locale) || {}
            )
          );
        }
        this.registrations.push(registration);
        this.reapply(registration.locale);
      }
      return () => {
        for (const registration of added) {
          remove(this.registrations, registration);
          this.reapply(registration.locale);
        }
      };
    });
  }

  /**
   * Re-applies the base catalogue plus every live registration. Deleting keys
   * would be wrong: two plugins may define the same key, and a plugin may
   * deliberately override a core string.
   */
  private reapply(locale: string) {
    const global = getI18nInstance().global as any;
    global.setLocaleMessage(locale, cloneMessages(this.base.get(locale) || {}));
    for (const registration of this.registrations) {
      if (registration.locale !== locale) continue;
      global.mergeLocaleMessage(locale, cloneMessages(registration.messages));
    }
  }
}

export class RoutesService extends Service implements FrontendRoutesService {
  /** Route path to the name of the plugin that added it. */
  private readonly owners = new Map<string, string>();
  private readonly generation = shallowRef(0);

  constructor(ctx: Context) {
    super(ctx, "routes", true);
  }

  get revision() {
    return this.generation.value;
  }

  isPluginRoute(path: string) {
    void this.generation.value;
    return this.owners.has(path);
  }

  ownerOf(path: string) {
    void this.generation.value;
    return this.owners.get(path);
  }

  add(route: RouteRecordRaw) {
    // `ctx.name` is the calling plugin, which is how a route is attributed
    // without the caller having to pass its own id.
    const owner = this.ctx.name;
    return this.ctx.effect(() => {
      const before = new Set(router.getRoutes());
      const removeRoute = router.addRoute(route);
      const added = router.getRoutes().filter((record) => !before.has(record));
      for (const record of added) this.owners.set(record.path, owner);
      this.generation.value += 1;
      return () => {
        removeRoute();
        for (const record of added) this.owners.delete(record.path);
        this.generation.value += 1;
      };
    });
  }
}

interface ComponentStack {
  original?: Component;
  registrations: Component[];
}

/**
 * One place a named component can be installed: either Vue's global component
 * registry or the layout engine's card map. Both need the same stacking
 * behaviour, and naming the three operations keeps the two apart.
 */
interface ComponentSlots {
  stacks: Map<string, ComponentStack>;
  read(name: string): Component | undefined;
  write(name: string, component: Component): void;
  clear(name: string): void;
}

export class UiService extends Service implements FrontendUiService {
  // Declared because `app()` reads `ctx.vue` on every registration; without it
  // cordis warns once per call that the service was not injected.
  static inject = ["vue"];

  readonly globalComponents = shallowReactive<Component[]>([]);

  private readonly vueComponents: ComponentSlots = {
    stacks: new Map(),
    read: (name) => this.app().component(name),
    write: (name, component) => void this.app().component(name, component),
    clear: (name) => void delete this.app()._context.components[name]
  };

  private readonly layoutCards: ComponentSlots = {
    stacks: new Map(),
    read: (name) => LAYOUT_CARD_TYPES[name],
    write: (name, component) => void (LAYOUT_CARD_TYPES[name] = component),
    clear: (name) => void delete LAYOUT_CARD_TYPES[name]
  };

  constructor(ctx: Context) {
    super(ctx, "ui", true);
  }

  component(name: string, component: Component) {
    return this.ctx.effect(() => this.push(this.vueComponents, name, component));
  }

  layoutCard(name: string, component: Component) {
    // A card is also a global component, because layouts render cards by name.
    const disposeComponent = this.component(name, component);
    const disposeCard = this.ctx.effect(() => this.push(this.layoutCards, name, component));
    return () => {
      disposeCard();
      disposeComponent();
    };
  }

  layoutCardPoolItem(createItem: LayoutCardPoolItemFactory) {
    return this.ctx.effect(() => {
      PLUGIN_LAYOUT_CARD_POOL_FACTORIES.push(createItem);
      return () => remove(PLUGIN_LAYOUT_CARD_POOL_FACTORIES, createItem);
    });
  }

  globalComponent(component: Component) {
    return this.ctx.effect(() => {
      this.globalComponents.push(component);
      return () => remove(this.globalComponents, component);
    });
  }

  /**
   * Stacks a registration so a plugin can override a core component or card and
   * have the original restored when it unloads. The last registration wins.
   */
  private push(slots: ComponentSlots, name: string, component: Component) {
    let stack = slots.stacks.get(name);
    if (!stack) {
      stack = { original: slots.read(name), registrations: [] };
      slots.stacks.set(name, stack);
    }
    stack.registrations.push(component);
    this.apply(slots, name);
    return () => {
      if (!slots.stacks.has(name)) return;
      remove(slots.stacks.get(name)!.registrations, component);
      this.apply(slots, name);
    };
  }

  private apply(slots: ComponentSlots, name: string) {
    const stack = slots.stacks.get(name);
    if (!stack) return;
    const latest = stack.registrations[stack.registrations.length - 1];
    if (latest) return slots.write(name, latest);
    if (stack.original) slots.write(name, stack.original);
    else slots.clear(name);
    slots.stacks.delete(name);
  }

  private app() {
    return this.ctx.vue.app;
  }
}

export class MenusService extends Service implements FrontendMenusService {
  readonly appMenus = shallowReactive<PanelFrontendAppMenu[]>([]);
  readonly loginActions = shallowReactive<PanelFrontendLoginAction[]>([]);

  constructor(ctx: Context) {
    super(ctx, "menus", true);
  }

  app(menu: PanelFrontendAppMenu) {
    return this.ctx.effect(() => {
      this.appMenus.push(menu);
      return () => remove(this.appMenus, menu);
    });
  }

  login(action: PanelFrontendLoginAction) {
    return this.ctx.effect(() => {
      this.loginActions.push(action);
      return () => remove(this.loginActions, action);
    });
  }
}

export class ActionsService extends Service implements FrontendActionsService {
  readonly instances = shallowReactive<PanelFrontendInstanceAction[]>([]);
  readonly schedules = shallowReactive<PanelFrontendScheduleAction[]>([]);
  readonly terminals = shallowReactive<PanelFrontendTerminalAction[]>([]);

  constructor(ctx: Context) {
    super(ctx, "actions", true);
  }

  instance(action: PanelFrontendInstanceAction) {
    if (!action.normalComponent && !action.desktopComponent) {
      throw new Error(`Instance action "${action.id}" needs a normal or desktop component.`);
    }
    return this.claim(this.instances, "instance action", action, (item) => item.id === action.id);
  }

  schedule(action: PanelFrontendScheduleAction) {
    return this.claim(
      this.schedules,
      "schedule action",
      action,
      (item) => item.type === action.type
    );
  }

  terminal(action: PanelFrontendTerminalAction) {
    return this.claim(this.terminals, "terminal action", action, (item) => item.id === action.id);
  }

  terminalButtons(state: PanelFrontendTerminalActionContext) {
    return this.terminals.map((action) => ({
      title: typeof action.title === "function" ? action.title() : action.title,
      icon: action.icon,
      type: action.type ?? "default",
      class: action.class,
      noConfirm: action.noConfirm ?? true,
      props: action.props ?? {},
      click: () => action.click(state),
      condition: () => (action.condition ? action.condition(state) : true)
    }));
  }

  private claim<T>(items: T[], kind: string, item: T, isDuplicate: (other: T) => boolean) {
    return this.ctx.effect(() => {
      if (items.some(isDuplicate)) throw new Error(`Duplicate ${kind} registration.`);
      items.push(item);
      return () => remove(items, item);
    });
  }
}

/**
 * Desktop mode's application registry and window shell.
 *
 * The registry is core-owned even though Desktop mode itself is a plugin: an
 * application is contributed by whichever plugin owns the page, and the
 * registration has to be disposed with *that* plugin. Only a `Service` method
 * can attribute an effect to its caller, so this cannot live in the Desktop
 * plugin. Without that plugin nothing renders the registry and the entries are
 * simply inert.
 */
export class DesktopService extends Service implements FrontendDesktopService {
  readonly apps = shallowReactive<PanelFrontendDesktopApp[]>([]);
  private readonly shell = shallowRef<Component>();

  constructor(ctx: Context) {
    super(ctx, "desktop", true);
  }

  /** The window a Desktop component is mounted inside, once Desktop is installed. */
  get window() {
    return this.shell.value;
  }

  provideWindow(component: Component) {
    return this.ctx.effect(() => {
      this.shell.value = component;
      return () => {
        this.shell.value = undefined;
      };
    });
  }

  app(desktopApp: PanelFrontendDesktopApp) {
    const id = desktopApp.id.trim();
    if (!id) throw new Error("A Desktop application needs an id.");
    if (!desktopApp.component && !desktopApp.route) {
      throw new Error(`Desktop application "${id}" needs a component or a route.`);
    }
    const entry = { ...desktopApp, id };
    return this.ctx.effect(() => {
      if (this.apps.some((app) => app.id === id)) {
        throw new Error(`Desktop application id is already registered: ${id}`);
      }
      this.apps.push(entry);
      return () => remove(this.apps, entry);
    });
  }
}

