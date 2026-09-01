import type { PanelPluginContext } from "../../../../src/app/plugin";
import { localeMessages } from "../i18n";
import { createRequestGuard } from "./guard";
import createAuthSettingsRouter, {
  applyAuthSettings,
  readAuthSettings
} from "./routers/auth_settings_router";
import createGeneralUserRouter from "./routers/general_user_router";
import createLoginRouter from "./routers/login_router";
import createManageUserRouter from "./routers/manage_user_router";
import createSsoRouter from "./routers/sso_router";
import createUserOverviewRouter from "./routers/user_overview_router";
import { setPluginContext } from "./runtime";
import { initAuthSettings } from "./service/auth_settings";
import userSystem from "./service/user_service";

// Authentication for the whole panel: accounts, sessions, SSO and the
// authorization policy every core route is checked against. The core holds none
// of it — it asks `ctx.guard`, and serves every request while nothing provides
// one.

export const inject = [
  "koa",
  "i18n",
  "storage",
  "settings",
  "settingsForm",
  "middleware",
  "roles",
  "instances",
  "operations",
  "globals"
];

export async function apply(ctx: PanelPluginContext) {
  setPluginContext(ctx);

  // Before anything that logs or throws: this plugin's strings live here, not
  // in the panel catalogue.
  ctx.i18n.define(localeMessages);

  await initAuthSettings();
  await userSystem.initialize();

  // From here on the whole panel is guarded. Unloading this plugin removes the
  // service, and with it the policy, which is the documented behaviour.
  ctx.set("guard", createRequestGuard());

  // Nested under a single /api router, in the same order the core used to mount
  // them: several of these share the "/auth/" path and only differ by method,
  // so a flat registration would let one router's allowedMethods() answer 405
  // before the next router got a chance to match.
  const apiRouter = ctx.koa.router("/api");
  for (const router of [
    createManageUserRouter(),
    createLoginRouter(),
    createGeneralUserRouter(),
    createUserOverviewRouter(),
    createAuthSettingsRouter(),
    createSsoRouter()
  ]) {
    apiRouter.use(router.routes()).use(router.allowedMethods());
  }

  // Described, not drawn. The login notice, the IP check, the 2FA tolerance and
  // the whole SSO block used to be a Vue form this plugin shipped; they are now a
  // declaration the plugin manager renders with the same generic form it uses for
  // a daemon plugin's configuration. `write` is the route's own handler, so the
  // SSO validation has one home rather than a copy in the browser.
  const $t = ctx.i18n.$t;
  const yesNo = () => [
    { value: true, label: $t("TXT_CODE_52c8a730") },
    { value: false, label: $t("TXT_CODE_718c9310") }
  ];

  ctx.settingsForm.declare({
    fields: () => [
      {
        key: "loginInfo",
        type: "text",
        title: $t("TXT_CODE_b5b33dd4"),
        description: $t("TXT_CODE_c26e5fb7")
      },
      {
        key: "loginCheckIp",
        type: "boolean",
        title: $t("TXT_CODE_1d67c9c6"),
        description: $t("TXT_CODE_745fc959")
      },
      {
        key: "totpDriftToleranceSteps",
        type: "select",
        title: $t("TXT_CODE_b026be33"),
        description: $t("TXT_CODE_a77b1a21"),
        options: [
          { value: 0, label: $t("TXT_CODE_718c9310") },
          { value: 1, label: "30 s" },
          { value: 2, label: "60 s" }
        ]
      },
      {
        key: "allowChangeCmd",
        type: "boolean",
        title: $t("TXT_CODE_a583cae4"),
        description: $t("TXT_CODE_bfbdf579")
      },
      {
        key: "canFileManager",
        type: "boolean",
        title: $t("TXT_CODE_adab942e"),
        description: `${$t("TXT_CODE_ceb783a9")} ${$t("TXT_CODE_e5b7522d")}`
      },
      {
        key: "allowJavaManager",
        type: "boolean",
        title: $t("TXT_CODE_ALLOW_JAVA_MANAGER"),
        description: $t("TXT_CODE_ALLOW_JAVA_MANAGER_DESC")
      },
      {
        key: "ssoEnabled",
        type: "boolean",
        title: $t("TXT_CODE_SSO_ENABLE"),
        description: $t("TXT_CODE_SSO_ENABLE_DESC")
      },
      {
        key: "ssoType",
        type: "select",
        title: $t("TXT_CODE_SSO_TAB_TITLE"),
        options: [
          { value: "oidc", label: "OIDC" },
          { value: "oauth2", label: "OAuth 2.0" }
        ],
        visibleWhen: "ssoEnabled"
      },
      {
        key: "ssoProviderName",
        type: "string",
        title: $t("TXT_CODE_SSO_PROVIDER_NAME"),
        description: $t("TXT_CODE_SSO_PROVIDER_NAME_DESC"),
        visibleWhen: "ssoEnabled"
      },
      {
        key: "ssoIconUrl",
        type: "string",
        title: $t("TXT_CODE_SSO_ICON_URL"),
        description: $t("TXT_CODE_SSO_ICON_URL_DESC"),
        visibleWhen: "ssoEnabled"
      },
      {
        key: "ssoIssuer",
        type: "string",
        title: $t("TXT_CODE_SSO_ISSUER"),
        description: $t("TXT_CODE_SSO_ISSUER_DESC"),
        visibleWhen: ["ssoEnabled", "ssoType=oidc"]
      },
      {
        key: "ssoAuthorizeUrl",
        type: "string",
        title: $t("TXT_CODE_SSO_AUTHORIZE_URL"),
        description: $t("TXT_CODE_SSO_AUTHORIZE_URL_DESC"),
        visibleWhen: ["ssoEnabled", "ssoType=oauth2"]
      },
      {
        key: "ssoTokenUrl",
        type: "string",
        title: $t("TXT_CODE_SSO_TOKEN_URL"),
        description: $t("TXT_CODE_SSO_TOKEN_URL_DESC"),
        visibleWhen: ["ssoEnabled", "ssoType=oauth2"]
      },
      {
        key: "ssoUserinfoUrl",
        type: "string",
        title: $t("TXT_CODE_SSO_USERINFO_URL"),
        description: $t("TXT_CODE_SSO_USERINFO_URL_DESC"),
        visibleWhen: ["ssoEnabled", "ssoType=oauth2"]
      },
      {
        key: "ssoUserIdField",
        type: "string",
        title: $t("TXT_CODE_SSO_USER_ID_FIELD"),
        description: $t("TXT_CODE_SSO_USER_ID_FIELD_DESC"),
        visibleWhen: ["ssoEnabled", "ssoType=oauth2"]
      },
      {
        key: "ssoScopes",
        type: "string",
        title: $t("TXT_CODE_SSO_SCOPES"),
        description: $t("TXT_CODE_SSO_SCOPES_DESC"),
        visibleWhen: ["ssoEnabled", "ssoType=oauth2"]
      },
      {
        key: "ssoClientId",
        type: "string",
        title: "Client ID",
        description: $t("TXT_CODE_SSO_CLIENT_ID_DESC"),
        visibleWhen: "ssoEnabled"
      },
      {
        key: "ssoClientSecret",
        type: "string",
        title: "Client Secret",
        description: $t("TXT_CODE_SSO_CLIENT_SECRET_DESC"),
        secret: true,
        visibleWhen: "ssoEnabled"
      },
      {
        key: "ssoCallbackUrl",
        type: "string",
        title: $t("TXT_CODE_SSO_CALLBACK_URL"),
        description: $t("TXT_CODE_SSO_CALLBACK_URL_DESC"),
        visibleWhen: "ssoEnabled"
      },
      {
        key: "ssoOnlyMode",
        type: "boolean",
        title: $t("TXT_CODE_SSO_ONLY_MODE"),
        description: $t("TXT_CODE_SSO_ONLY_MODE_DESC"),
        options: yesNo(),
        visibleWhen: "ssoEnabled"
      },
      {
        key: "ssoAutoRedirect",
        type: "boolean",
        title: $t("TXT_CODE_SSO_AUTO_REDIRECT"),
        description: $t("TXT_CODE_SSO_AUTO_REDIRECT_DESC"),
        visibleWhen: "ssoEnabled"
      }
    ],
    // Two stores, one form. The authentication settings are this plugin's own
    // record; the three "what may an ordinary user do" switches stay in
    // `SystemConfig`, because the file manager, the Java manager and the
    // instance routes read them — but deciding them is the guard's business, so
    // the form that edits them belongs here.
    read: () => ({
      ...readAuthSettings(),
      allowChangeCmd: ctx.settings.config.allowChangeCmd,
      canFileManager: ctx.settings.config.canFileManager,
      allowJavaManager: ctx.settings.config.allowJavaManager
    }),
    write: async (values) => {
      await applyAuthSettings(values);
      const config = ctx.settings.config;
      if (values.allowChangeCmd != null) config.allowChangeCmd = Boolean(values.allowChangeCmd);
      if (values.canFileManager != null) config.canFileManager = Boolean(values.canFileManager);
      if (values.allowJavaManager != null) {
        config.allowJavaManager = Boolean(values.allowJavaManager);
      }
      ctx.settings.save();
    }
  });
}
