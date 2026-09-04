# Console plugin

The console plugin owns the panel's foundational browser UI:

- the root application shell and navigation;
- the base `/`, `/settings`, `/404`, `/customer` and `/_open_page` routes;
- built-in layout cards and design-mode picker entries;
- global Web UI styles, Ant Design defaults and layout initialization.

`frontend/src/App.vue` is only a host for the `console` service. Feature plugins
continue to use the core route and layout registries, while their own pages,
cards and overlays remain scoped to their plugin.
