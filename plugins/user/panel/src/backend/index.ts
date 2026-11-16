import { migrateConfig } from "./service/version_adapter";
import type { PanelPluginContext } from "../../../../../core/panel/src/app/plugin";
import Koa from "koa";
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

// Provide accounts, sessions, SSO and request authorization through the guard service.

export const inject = [
  "koa",
  "i18n",
  "storage",
  "settings",
  "settingsForm",
  "middleware",
  "roles",
  "identity",
  "operations",
  "globals"
];

export async function apply(ctx: PanelPluginContext) {
  setPluginContext(ctx);
  migrateConfig(ctx);

  // Register authentication translations before logging or throwing.
  ctx.i18n.define(localeMessages);

  await initAuthSettings();
  await userSystem.initialize();

  // Removing this plugin removes the panel's authorization policy.
  ctx.set("guard", createRequestGuard());

  // Expose authentication status before account pages render.
  const statusRouter = ctx.koa.router("/api/auth");
  statusRouter.all(
    "/status",
    ctx.middleware.permission({ token: false, level: null, speedLimit: false }),
    async (requestCtx: Koa.ParameterizedContext) => {
      const accessPolicy = ctx.identity.accessPolicy;
      requestCtx.body = {
        versionChange: ctx.globals.get("versionChange", null),
        language: ctx.settings.config.language || null,
        settings: {
          canFileManager: accessPolicy.canFileManager,
          allowChangeCmd: accessPolicy.allowChangeCmd,
          allowJavaManager: accessPolicy.allowJavaManager
        }
      };
    }
  );

  // Nest auth routers under one /api router so allowedMethods() cannot return 405 before a later match.
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

  // Declare settings for the generic plugin form and reuse the route handler's validation.
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
    read: readAuthSettings,
    write: applyAuthSettings
  });
}
