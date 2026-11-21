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
import AuthSettings from "./entity/auth_settings";
import userSystem from "./service/user_service";

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

  const $t = ctx.i18n.$t;
  const yesNo = () => [
    { value: true, label: $t("TXT_CODE_COMMON_ENABLE") },
    { value: false, label: $t("TXT_CODE_COMMON_DISABLE") }
  ];

  ctx.settingsForm.declare({
    reset: () => applyAuthSettings({ ...new AuthSettings() }, true),
    fields: () => {
      const loginPage = { id: "login", title: $t("TXT_CODE_SETTINGS_PAGE_LOGIN") };
      const permissionsPage = { id: "permissions", title: $t("TXT_CODE_SETTINGS_PAGE_USER_PERMISSIONS") };
      return [
        {
          key: "loginInfo",
          page: loginPage,
          type: "text",
          title: $t("TXT_CODE_COMMON_CUSTOM_TEXT_ON_THE_LOGIN_PAGE"),
          description: $t("TXT_CODE_COMMON_SUPPORT_MARKDOWN_FORMAT")
        },
        {
          key: "loginCheckIp",
          page: loginPage,
          type: "boolean",
          title: $t("TXT_CODE_COMMON_LIMIT_LOGIN_ATTEMPTS_FROM_THE_SAME_IP"),
          description: $t("TXT_CODE_USER_PASSWORD_BRUTE_FORCE_PROTECTION_HINT")
        },
        {
          key: "totpDriftToleranceSteps",
          page: loginPage,
          type: "select",
          title: $t("TXT_CODE_COMMON_TWO_FACTOR_AUTHENTICATION_TOTP_TIME_DRIFT_TOLERANCE"),
          description: $t("TXT_CODE_USER_TOTP_CLOCK_TOLERANCE_HINT"),
          options: [
            { value: 0, label: $t("TXT_CODE_COMMON_DISABLE") },
            { value: 1, label: "30 s" },
            { value: 2, label: "60 s" }
          ]
        },
        {
          key: "allowChangeCmd",
          page: permissionsPage,
          type: "boolean",
          title: $t("TXT_CODE_COMMON_ALLOW_NORMAL_USERS_TO_EDIT_INSTANCE_ADVANCED_CONFIGURATION"),
          description: $t("TXT_CODE_USER_DOCKER_CONFIG_EDIT_PERMISSION_HINT")
        },
        {
          key: "canFileManager",
          page: permissionsPage,
          type: "boolean",
          title: $t("TXT_CODE_COMMON_FILE_MANAGEMENT_FOR_USERS"),
          description: `${$t("TXT_CODE_COMMON_FILE_MANAGEMENT_IS_A_RESOURCE_INTENSIVE_AND_LESS_CONTROLLABLE_FUNCTION")} ${$t("TXT_CODE_COMMON_IF_YOUR_REGULAR_USERS_DO_NOT_NEED_FILE_MANAGEMENT_YOU_CAN_DISABLE_THEIR_ACCESS_TO_THIS")}`
        },
        {
          key: "allowJavaManager",
          page: permissionsPage,
          type: "boolean",
          title: $t("TXT_CODE_ALLOW_JAVA_MANAGER"),
          description: $t("TXT_CODE_ALLOW_JAVA_MANAGER_DESC")
        },
        {
          key: "ssoEnabled",
          page: loginPage,
          type: "boolean",
          title: $t("TXT_CODE_SSO_ENABLE"),
          description: $t("TXT_CODE_SSO_ENABLE_DESC")
        },
        {
          key: "ssoType",
          page: loginPage,
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
          page: loginPage,
          type: "string",
          title: $t("TXT_CODE_SSO_PROVIDER_NAME"),
          description: $t("TXT_CODE_SSO_PROVIDER_NAME_DESC"),
          visibleWhen: "ssoEnabled"
        },
        {
          key: "ssoIconUrl",
          page: loginPage,
          type: "string",
          title: $t("TXT_CODE_SSO_ICON_URL"),
          description: $t("TXT_CODE_SSO_ICON_URL_DESC"),
          visibleWhen: "ssoEnabled"
        },
        {
          key: "ssoIssuer",
          page: loginPage,
          type: "string",
          title: $t("TXT_CODE_SSO_ISSUER"),
          description: $t("TXT_CODE_SSO_ISSUER_DESC"),
          visibleWhen: ["ssoEnabled", "ssoType=oidc"]
        },
        {
          key: "ssoAuthorizeUrl",
          page: loginPage,
          type: "string",
          title: $t("TXT_CODE_SSO_AUTHORIZE_URL"),
          description: $t("TXT_CODE_SSO_AUTHORIZE_URL_DESC"),
          visibleWhen: ["ssoEnabled", "ssoType=oauth2"]
        },
        {
          key: "ssoTokenUrl",
          page: loginPage,
          type: "string",
          title: $t("TXT_CODE_SSO_TOKEN_URL"),
          description: $t("TXT_CODE_SSO_TOKEN_URL_DESC"),
          visibleWhen: ["ssoEnabled", "ssoType=oauth2"]
        },
        {
          key: "ssoUserinfoUrl",
          page: loginPage,
          type: "string",
          title: $t("TXT_CODE_SSO_USERINFO_URL"),
          description: $t("TXT_CODE_SSO_USERINFO_URL_DESC"),
          visibleWhen: ["ssoEnabled", "ssoType=oauth2"]
        },
        {
          key: "ssoUserIdField",
          page: loginPage,
          type: "string",
          title: $t("TXT_CODE_SSO_USER_ID_FIELD"),
          description: $t("TXT_CODE_SSO_USER_ID_FIELD_DESC"),
          visibleWhen: ["ssoEnabled", "ssoType=oauth2"]
        },
        {
          key: "ssoScopes",
          page: loginPage,
          type: "string",
          title: $t("TXT_CODE_SSO_SCOPES"),
          description: $t("TXT_CODE_SSO_SCOPES_DESC"),
          visibleWhen: ["ssoEnabled", "ssoType=oauth2"]
        },
        {
          key: "ssoClientId",
          page: loginPage,
          type: "string",
          title: "Client ID",
          description: $t("TXT_CODE_SSO_CLIENT_ID_DESC"),
          visibleWhen: "ssoEnabled"
        },
        {
          key: "ssoClientSecret",
          page: loginPage,
          type: "string",
          title: "Client Secret",
          description: $t("TXT_CODE_SSO_CLIENT_SECRET_DESC"),
          secret: true,
          visibleWhen: "ssoEnabled"
        },
        {
          key: "ssoCallbackUrl",
          page: loginPage,
          type: "string",
          title: $t("TXT_CODE_SSO_CALLBACK_URL"),
          description: $t("TXT_CODE_SSO_CALLBACK_URL_DESC"),
          visibleWhen: "ssoEnabled"
        },
        {
          key: "ssoOnlyMode",
          page: loginPage,
          type: "boolean",
          title: $t("TXT_CODE_SSO_ONLY_MODE"),
          description: $t("TXT_CODE_SSO_ONLY_MODE_DESC"),
          options: yesNo(),
          visibleWhen: "ssoEnabled"
        },
        {
          key: "ssoAutoRedirect",
          page: loginPage,
          type: "boolean",
          title: $t("TXT_CODE_SSO_AUTO_REDIRECT"),
          description: $t("TXT_CODE_SSO_AUTO_REDIRECT_DESC"),
          visibleWhen: "ssoEnabled"
        }
      ];
    },
    read: readAuthSettings,
    write: applyAuthSettings
  });
}
