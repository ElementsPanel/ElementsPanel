import Router from "@koa/router";
import Koa from "koa";
import AuthSettings from "../entity/auth_settings";
import { logger, operationLogger, ROLE } from "../runtime";
import permission from "../middleware/permission";
import { authSettings, saveAuthSettings } from "../service/auth_settings";
import { clearOIDCCache, verifyIssuer } from "../service/sso_service";
import userSystem from "../service/user_service";

const SECRET_PLACEHOLDER = "";

function assertHttpUrl(url: string, name: string) {
  if (url && !url.startsWith("https://") && !url.startsWith("http://")) {
    throw new Error(`SSO ${name} must use http(s) protocol`);
  }
}

/** The settings as the form reads them: the client secret is write-only. */
export function readAuthSettings() {
  const { migrationVersion: _migrationVersion, ...settings } = authSettings();
  return { ...settings, ssoClientSecret: SECRET_PLACEHOLDER };
}

/**
 * Applies and persists a settings patch. Both the route below and the plugin's
 * declared configuration form go through here, so the validation — the SSO URL
 * checks, the "keep the stored secret" rule and the unbinding of SSO users when
 * an identity-critical field changes — has exactly one home.
 */
export async function applyAuthSettings(values: Record<string, unknown>) {
  const config = values as Partial<AuthSettings>;
  const settings = authSettings();

  if (config.loginInfo != null) settings.loginInfo = String(config.loginInfo);
  if (config.loginCheckIp != null) settings.loginCheckIp = Boolean(config.loginCheckIp);
  if (config.totpDriftToleranceSteps != null) {
    const steps = Number(config.totpDriftToleranceSteps);
    if (!Number.isInteger(steps) || steps < 0 || steps > 10) {
      throw new Error("totpDriftToleranceSteps must be an integer between 0 and 10");
    }
    settings.totpDriftToleranceSteps = steps;
  }
  // Snapshot identity-critical SSO fields before applying changes
  const prevSsoType = settings.ssoType || "oidc";
  const prevSsoIssuer = settings.ssoIssuer;
  const prevSsoUserinfoUrl = settings.ssoUserinfoUrl;
  const prevSsoUserIdField = settings.ssoUserIdField || "id";

  if (config.ssoType != null) {
    const type = String(config.ssoType);
    if (type !== "oidc" && type !== "oauth2") {
      throw new Error("ssoType must be 'oidc' or 'oauth2'");
    }
    settings.ssoType = type;
  }
  const ssoType = settings.ssoType || "oidc";

  const wantEnable =
    config.ssoEnabled != null ? Boolean(config.ssoEnabled) : settings.ssoEnabled;
  const clientId =
    config.ssoClientId != null ? String(config.ssoClientId) : settings.ssoClientId;
  // An empty secret means "keep the stored one".
  const clientSecret =
    config.ssoClientSecret != null && String(config.ssoClientSecret) !== SECRET_PLACEHOLDER
      ? String(config.ssoClientSecret)
      : settings.ssoClientSecret;

  if (ssoType === "oidc") {
    const issuer = config.ssoIssuer != null ? String(config.ssoIssuer) : settings.ssoIssuer;
    assertHttpUrl(issuer, "Issuer URL");
    if (wantEnable && (!issuer?.trim() || !clientId?.trim() || !clientSecret?.trim())) {
      throw new Error(
        "Cannot enable SSO (OIDC): Issuer, Client ID, and Client Secret are required"
      );
    }
    if (issuer?.trim() && clientId?.trim() && clientSecret?.trim()) {
      await verifyIssuer(issuer, clientId, clientSecret);
      clearOIDCCache();
    }
    if (config.ssoIssuer != null) settings.ssoIssuer = issuer;
  } else {
    const authorizeUrl =
      config.ssoAuthorizeUrl != null
        ? String(config.ssoAuthorizeUrl)
        : settings.ssoAuthorizeUrl;
    const tokenUrl =
      config.ssoTokenUrl != null ? String(config.ssoTokenUrl) : settings.ssoTokenUrl;
    const userinfoUrl =
      config.ssoUserinfoUrl != null ? String(config.ssoUserinfoUrl) : settings.ssoUserinfoUrl;

    assertHttpUrl(authorizeUrl, "Authorize URL");
    assertHttpUrl(tokenUrl, "Token URL");
    assertHttpUrl(userinfoUrl, "Userinfo URL");

    if (
      wantEnable &&
      (!authorizeUrl?.trim() ||
        !tokenUrl?.trim() ||
        !userinfoUrl?.trim() ||
        !clientId?.trim() ||
        !clientSecret?.trim())
    ) {
      throw new Error(
        "Cannot enable SSO (OAuth 2.0): Authorize URL, Token URL, Userinfo URL, Client ID, and Client Secret are required"
      );
    }

    if (config.ssoAuthorizeUrl != null) settings.ssoAuthorizeUrl = authorizeUrl;
    if (config.ssoTokenUrl != null) settings.ssoTokenUrl = tokenUrl;
    if (config.ssoUserinfoUrl != null) settings.ssoUserinfoUrl = userinfoUrl;
  }

  if (config.ssoEnabled != null) settings.ssoEnabled = wantEnable;
  if (config.ssoClientId != null) settings.ssoClientId = clientId;
  settings.ssoClientSecret = clientSecret;
  if (config.ssoUserIdField != null) {
    settings.ssoUserIdField = String(config.ssoUserIdField) || "id";
  }

  // Unbind all SSO users when identity-critical fields change
  const typeChanged = settings.ssoType !== prevSsoType;
  const issuerChanged = ssoType === "oidc" && settings.ssoIssuer !== prevSsoIssuer;
  const userinfoChanged =
    ssoType === "oauth2" && settings.ssoUserinfoUrl !== prevSsoUserinfoUrl;
  const userIdFieldChanged =
    ssoType === "oauth2" && settings.ssoUserIdField !== prevSsoUserIdField;
  if (typeChanged || issuerChanged || userinfoChanged || userIdFieldChanged) {
    const count = await userSystem.unbindAllSso();
    if (count > 0) {
      logger().warn(`[SSO] Identity-critical config changed, unbound ${count} SSO user(s).`);
    }
  }

  if (config.ssoScopes != null) settings.ssoScopes = String(config.ssoScopes);
  if (config.ssoOnlyMode != null) settings.ssoOnlyMode = Boolean(config.ssoOnlyMode);
  if (config.ssoAutoRedirect != null) {
    settings.ssoAutoRedirect = Boolean(config.ssoAutoRedirect);
  }
  if (config.ssoProviderName != null) {
    settings.ssoProviderName = String(config.ssoProviderName);
  }
  if (config.ssoIconUrl != null) {
    const iconUrl = String(config.ssoIconUrl);
    if (
      iconUrl &&
      !iconUrl.startsWith("https://") &&
      !iconUrl.startsWith("http://") &&
      !iconUrl.startsWith("/")
    ) {
      throw new Error("SSO icon URL must use http(s) protocol or be a relative path");
    }
    settings.ssoIconUrl = iconUrl;
  }
  if (config.ssoCallbackUrl != null) {
    const cbUrl = String(config.ssoCallbackUrl);
    assertHttpUrl(cbUrl, "Callback URL");
    settings.ssoCallbackUrl = cbUrl;
  }
  if (config.allowChangeCmd != null) settings.allowChangeCmd = Boolean(config.allowChangeCmd);
  if (config.canFileManager != null) settings.canFileManager = Boolean(config.canFileManager);
  if (config.allowJavaManager != null) {
    settings.allowJavaManager = Boolean(config.allowJavaManager);
  }
  await saveAuthSettings();
}

export default function createAuthSettingsRouter() {
  const router = new Router({ prefix: "/auth" });

  // [Top-level Permission] Read the authentication settings.
  router.get(
    "/settings",
    permission({ level: ROLE().ADMIN }),
    async (ctx: Koa.ParameterizedContext) => {
      // The client secret is write-only: never send it back to the browser.
      ctx.body = readAuthSettings();
    }
  );

  // [Top-level Permission] Update the authentication settings.
  router.put(
    "/settings",
    permission({ level: ROLE().ADMIN }),
    async (ctx: Koa.ParameterizedContext) => {
      await applyAuthSettings((ctx.request.body || {}) as Record<string, unknown>);
      operationLogger().log("system_config_change", {
        operator_ip: ctx.ip,
        operator_name: ctx.session?.["userName"]
      });
      ctx.body = "OK";
    }
  );

  return router;
}
