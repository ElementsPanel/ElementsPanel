# Console plugin

The console plugin owns the panel's foundational browser UI:

- the root application shell and navigation;
- the base `/`, `/404`, `/customer` and `/_open_page` routes;
- built-in layout cards and design-mode picker entries;
- shared browser components, hooks, stores, services, tools and types used by
  the feature plugins;
- global Web UI styles, Ant Design defaults and layout initialization;
- the panel appearance settings form, frontend layout routes and asset uploads.

Appearance settings are declared by the backend half of this plugin and rendered
by the `config` plugin's generic configuration page. They include the navigation
position, page title, logo and background image. The same form links to the
layout designer. The layout persistence service also lives in this plugin; its
default layout references cards contributed by other plugins through the shared
UI registry.

`frontend/src/App.vue` is only a host for the `console` service. The rest of the
browser implementation lives under this plugin, while feature plugins continue
to use the console route and layout registries and keep their own pages, cards
and overlays scoped to their plugin.
