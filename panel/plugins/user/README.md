# User Management

> **Removing this plugin removes panel authentication.** The panel then treats
> every request as an anonymous administrator and every API is open. The OOBE
> plugin remains available but skips its optional administrator-account step.
> The default build ships with this plugin installed.

Owns login, multi-user management, permissions, 2FA, API keys and SSO, on both
the panel backend and the frontend (including Desktop mode).

## Backend

`src/backend/` is TypeScript and is compiled to `backend/index.cjs` by
`panel/webpack.plugins.config.js` (run as part of `npm run build` in `panel/`).
It cannot import panel core modules directly — they are bundled into `app.js`,
so a second copy would create a second storage subsystem and system config.
Everything it needs is injected through the plugin context and read via
`src/backend/runtime.ts`.

`apply()` initializes the user store and calls `ctx.set("guard", ...)`,
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
| `GET` `PUT` | `/api/auth/settings` (authentication settings) |
| `PUT` | `/api/auth/update`, `/api/auth/api` |
| `POST` | `/api/auth/bind2fa`, `/api/auth/confirm2fa` |
| `GET` `POST` `PUT` | `/api/auth/sso/*` |

They are nested under one `/api` router in the order the core used to mount
them, because several share the `/auth/` path and differ only by method.

`/api/auth/status` and `/api/auth/proxy` stay in the panel core
(`src/app/routers/panel_status_router.ts`): the frontend reads `/status` during
bootstrap, before any plugin has loaded.

### What the core keeps

Only an extension point, in `src/app/service/request_guard.ts`: the
`RequestGuard` interface and an `UNGUARDED` null object describing what "nobody
is guarding this panel" means. There is no policy and no `if (authEnabled)`
branch anywhere in the core — `getRequestGuard()` always returns a guard, so
every call site is unconditional.

`src/backend/guard.ts` implements the whole interface:

| Guard member | Owns |
| --- | --- |
| `guardRoute(route)` | rate limit, API key, token, ban list, permission level |
| `identify(ctx)` | session / API key → uuid, user name, role, elevation |
| `canAccessInstance` | instance ownership |
| `canUpload` | admin-only multipart uploads |
| `accessPolicy` | ordinary-user command, file-manager and Java-manager capabilities |
| `stats` | the login counters the panel overview reports |
| `accounts`, `users` | session establishment and the user records |

The core's `middleware/permission.ts` is pure late binding: routers declare
requirements at module load, long before plugins exist, so the guard is resolved
per request.

Business-mode redeem (`instance_exchange_router`) and the redeem flow in
`service/exchange_service.ts` genuinely need accounts, so they declare a hard
dependency through `requireGuardFeature()` and fail with a clear error instead of
behaving as if everyone were an administrator.

## Settings

Login page text, the login IP limit, the 2FA drift tolerance, the ordinary-user
capability switches and the entire SSO block used to sit in the panel's
`SystemConfig` and on the Settings page. This plugin now owns all of them:
`entity/auth_settings.ts` defines them, `service/auth_settings.ts` stores them
under `AuthSettings/config` and `routers/auth_settings_router.ts` serves
`/api/auth/settings`. The SSO provider plumbing (`service/sso_service.ts`) moved
across with them.

On first start the plugin copies the values out of the panel's stored
`SystemConfig` once, so upgrades keep their configuration. `/api/auth/status` no
longer reports SSO at all; anything that needs to know asks the plugin's public
`/api/auth/sso/config`.

They are edited through the `config` plugin's generic page. This plugin declares
the form with `ctx.settingsForm.declare()`, including its read and write handlers,
rather than adding a tab to the panel Settings page.

## Frontend

`src/api.ts` holds the real `/api/auth/*` definitions and is registered as the
`user.api` service. `frontend/src/services/apis/user.ts` in the core is a facade
over it, re-exported from `@/services/apis`, so existing call sites are
unchanged and `useAppStateStore().authEnabled` reports whether this plugin is
installed.

Registered by `src/frontend.ts`:

- Routes `/login`, `/sso/bind`, `/users` (+ `/users/resources`), `/user`
- Layout cards `LoginCard`, `UserList`, `UserStatusBlock`, `UserInstanceList`,
  `UserAccessSettings`
- Global component `MyselfInfoDialog`
- Services `user.api`, `user.desktopLoginWindow`, `user.desktopUsers`,
  `user.desktopUserInfo`, `user.desktopStartMenuAvatar`,
  `user.oobeCreateAdminAccount`

The Desktop plugin resolves these services at render time and hides the login
overlay, the "Users" icon, the account window and the start-menu avatar when
they are missing. `src/desktop/DesktopWindow.vue` and `src/assets.ts` are
per-plugin copies, the same convention the `node` plugin uses.

The standalone `oobe` plugin owns `/install` and injects
`user.oobeCreateAdminAccount` for the administrator-account step. The account
form, validation and `/api/auth/install` request therefore remain owned by this
plugin even though the surrounding first-run flow does not. If this plugin is
absent, OOBE skips that optional step and can still complete normally.

## Translations

`src/i18n/` holds every string only this plugin uses — the login and account
pages, the user list, the SSO settings block, the Desktop user windows and the
messages the backend logs or throws. `src/frontend.ts` passes them to the panel
with `ctx.i18n.define()`, and `src/backend/index.ts` does the same on the panel's
i18next instance before it initializes anything, so a router that throws a
translated error never depends on the root `languages/` catalogue.

Strings shared with the panel core or with another plugin (the `desktop`
window chrome, for instance) stay in `languages/*.json`. Adding a string here
means adding it to all twelve files in `src/i18n/`.
