# Console plugin

The console plugin owns the panel's foundational browser UI:

- the root application shell and navigation;
- the base `/`, `/404`, `/customer` and `/_open_page` routes;
- built-in layout cards and design-mode picker entries;
- global Web UI styles, Ant Design defaults and layout initialization;
- the panel appearance settings form, frontend layout routes and asset uploads.

Appearance settings are declared by the backend half of this plugin and rendered
by the `config` plugin's generic configuration page. They include the navigation
position, page title, logo and background image. The same form links to the
layout designer. The layout persistence service remains in panel core because
its default layout contains cards contributed by other plugins.

`frontend/src/App.vue` is only a host for the `console` service. Feature plugins
continue to use the core route and layout registries, while their own pages,
cards and overlays remain scoped to their plugin.
