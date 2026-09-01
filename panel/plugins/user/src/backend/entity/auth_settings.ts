// Authentication settings and ordinary-user capabilities, owned by this
// plugin. They used to live in the panel's SystemConfig;
// `service/auth_settings.ts` migrates them across once.

export default class AuthSettings {
  // Internal migration marker. Version 1 moved the user capability switches
  // out of the panel's SystemConfig.
  migrationVersion = 0;

  // Text shown on the login page
  loginInfo: string = "";

  // Ban an IP after repeated login failures
  loginCheckIp: boolean = true;

  // TOTP drift tolerance, in steps (30 seconds)
  totpDriftToleranceSteps: number = 0;

  // Capabilities granted to ordinary users
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
  // Shared
  ssoClientId = "";
  ssoClientSecret = "";
  ssoCallbackUrl = "";
}
