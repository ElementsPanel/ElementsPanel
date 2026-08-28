# User Management

> **Removing this plugin removes panel authentication.** The panel then treats
> every request as an anonymous administrator: no login page, no install
> wizard, and every API open. That is the intended, documented behaviour — the
> default build ships with this plugin installed.

Owns login, multi-user management, permissions, 2FA, API keys and SSO, on both
the panel backend and the frontend (including Desktop mode).

## Backend

`src/backend/` is TypeScript and is compiled to `backend/index.cjs` by
`panel/webpack.plugins.config.js` (run as part of `npm run build` in `panel/`).
It cannot import panel core modules directly — they are bundled into `app.js`,
so a second copy would create a second storage subsystem and system config.
Everything it needs is injected through the plugin context and read via
`src/backend/runtime.ts`.

`setup()` initializes the user store and calls `context.registerAuthProvider()`,
which is what switches the whole panel from "open" to "authenticated". It then
mounts:

| Method | Route |
| --- | --- |
| `POST` | `/api/auth/login` |
| `GET` | `/api/auth/logout` |
| `ALL` | `/api/auth/login_info` |
| `ALL` | `/api/auth/install` |
| `GET` `POST` `PUT` `DELETE` | `/api/auth` (account CRUD) |
| `GET` | `/api/auth/search`, `/api/auth/token`, `/api/auth/query_username` |
| `GET` | `/api/auth/overview` |
| `PUT` | `/api/auth/update`, `/api/auth/api` |
| `POST` | `/api/auth/bind2fa`, `/api/auth/confirm2fa` |
| `GET` `POST` `PUT` | `/api/auth/sso/*` |

They are nested under one `/api` router in the order the core used to mount
them, because several share the `/auth/` path and differ only by method.

`/api/auth/status` and `/api/auth/proxy` stay in the panel core
(`src/app/routers/panel_status_router.ts`): the frontend reads `/status` during
bootstrap, before any plugin has loaded.

### What the core keeps

The core keeps thin delegating shims so the 17 routers that call
`permission({ level })` at module load need no changes:

- `src/app/service/auth_provider.ts` — the registry and the `PanelAuthProvider`
  interface.
- `src/app/middleware/permission.ts` ��� passes every request through when no
  provider is registered.
- `src/app/service/permission_service.ts` — instance ownership; answers "yes"
  when there is no provider.
- `src/app/service/passport_service.ts` — session readers, plus the counter keys
  that `overview_router` reports and this plugin increments.
- `src/app/service/user_store.ts` — optional access to the user records.

Business-mode redeem (`instance_exchange_router`) genuinely needs accounts, so
it fails with a clear error rather than degrading.

## Frontend

`src/api.ts` holds the real `/api/auth/*` definitions and is registered as the
`user.api` service. `frontend/src/services/apis/user.ts` in the core is a facade
over it, re-exported from `@/services/apis`, so existing call sites are
unchanged and `useAppStateStore().authEnabled` reports whether this plugin is
installed.

Registered by `src/frontend.ts`:

- Routes `/login`, `/install`, `/sso/bind`, `/users` (+ `/users/resources`), `/user`
- Layout cards `LoginCard`, `UserList`, `UserStatusBlock`, `UserInstanceList`,
  `UserAccessSettings`
- Global component `MyselfInfoDialog`
- Services `user.api`, `user.desktopLoginWindow`, `user.desktopUsers`,
  `user.desktopUserInfo`

The Desktop plugin resolves the three window services at render time and hides
the login overlay, the "Users" icon and the account window when they are
missing. `src/desktop/DesktopWindow.vue` and `src/assets.ts` are per-plugin
copies, the same convention the `node` plugin uses.

i18n reuses the existing keys in `languages/*.json`; this plugin ships no
translations of its own.
