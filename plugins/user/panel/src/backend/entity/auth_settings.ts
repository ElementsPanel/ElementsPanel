// Authentication settings migrated from legacy SystemConfig.

export default class AuthSettings {
  // Migration version for user capability fields moved from SystemConfig.
  migrationVersion = 0;

  loginInfo: string = "";

  loginCheckIp: boolean = true;

  // TOTP drift tolerance, in steps (30 seconds)
  totpDriftToleranceSteps: number = 0;

  allowChangeCmd = false;
  canFileManager = true;
  allowJavaManager = true;

  // SSO / OpenID Connect / OAuth 2.0
  ssoEnabled = false;
  ssoType: "oidc" | "oauth2" = "oidc";
  ssoOnlyMode = false;
  ssoAutoRedirect = false;
  ssoProviderName = "";
  ssoIconUrl = "";
  // OIDC-specific
  ssoIssuer = "";
  // OAuth 2.0-specific
  ssoAuthorizeUrl = "";
  ssoTokenUrl = "";
  ssoUserinfoUrl = "";
  ssoUserIdField = "id";
  ssoScopes = "";
  ssoClientId = "";
  ssoClientSecret = "";
  ssoCallbackUrl = "";
}
