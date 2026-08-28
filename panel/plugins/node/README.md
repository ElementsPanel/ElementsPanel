# Node Management

Provides the regular node management pages, Docker image management cards, node overview cards, and the node manager window in Desktop mode.

The plugin owns the node API factories (`src/api.ts`) and the shared
`useRemoteNode` hook (`src/hooks/useRemoteNode.ts`). They are registered as
runtime services (`node.api` and `node.useRemoteNode`) so other plugins can
consume node functionality without importing this plugin's source files.

It registers its routes and layout cards at runtime, so disabling or removing
the plugin removes the associated pages, cards, APIs, and hook services as
well.
