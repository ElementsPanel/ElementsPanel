import * as oidc from "openid-client";
import Koa from "koa";
import { core, logger } from "../runtime";
import { authSettings } from "./auth_settings";
import crypto from "crypto";

const corePrefix = () => core().config?.prefix || "";
const corePort = () => core().config?.httpPort || 23333;

// ─── OIDC Cache ───

let cachedConfig: oidc.Configuration | null = null;
let cachedIssuer = "";

export async function getOIDCConfig(): Promise<oidc.Configuration> {
  if (!authSettings().ssoEnabled) throw new Error("SSO is not enabled");
  if (!authSettings().ssoIssuer || !authSettings().ssoClientId || !authSettings().ssoClientSecret) {
    throw new Error("SSO configuration is incomplete");
  }

  if (cachedConfig && cachedIssuer === authSettings().ssoIssuer) {
    return cachedConfig;
  }

  try {
    const issuerUrl = new URL(authSettings().ssoIssuer);
    cachedConfig = await oidc.discovery(issuerUrl, authSettings().ssoClientId, authSettings().ssoClientSecret);
    cachedIssuer = authSettings().ssoIssuer;
    logger().info("[SSO] OIDC discovery completed for: " + authSettings().ssoIssuer);
    return cachedConfig;
  } catch (err: any) {
    cachedConfig = null;
    cachedIssuer = "";
    logger().error("[SSO] OIDC discovery failed: " + err.message);
    throw new Error("OIDC discovery failed. Check server logs for details.");
  }
}

export function clearOIDCCache() {
  cachedConfig = null;
  cachedIssuer = "";
}

export async function verifyIssuer(issuer: string, clientId: string, clientSecret: string): Promise<void> {
  try {
    const issuerUrl = new URL(issuer);
    await oidc.discovery(issuerUrl, clientId, clientSecret);
  } catch (err: any) {
    logger().error("[SSO] Issuer verification failed: " + err.message);
    throw new Error(`SSO Issuer verification failed: unable to reach ${issuer}/.well-known/openid-configuration`);
  }
}

// ─── Crypto helpers ───

export function generateState(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function generateNonce(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function generateCodeChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

// ─── Build Authorization URL (OIDC + OAuth 2.0) ───

export async function buildAuthorizationUrl(
  state: string,
  nonce: string,
  codeVerifier: string,
  ctx?: Koa.ParameterizedContext
): Promise<string> {
  const callbackUrl = getCallbackUrl(ctx);
  const codeChallenge = generateCodeChallenge(codeVerifier);

  if (authSettings().ssoType === "oauth2") {
    if (!authSettings().ssoAuthorizeUrl) throw new Error("OAuth 2.0 Authorize URL is not configured");
    const url = new URL(authSettings().ssoAuthorizeUrl);
    url.searchParams.set("client_id", authSettings().ssoClientId);
    url.searchParams.set("redirect_uri", callbackUrl);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
    const scopes = authSettings().ssoScopes?.trim() || "read:user";
    url.searchParams.set("scope", scopes);
    return url.href;
  }

  // OIDC mode
  const config = await getOIDCConfig();
  const scopes = authSettings().ssoScopes?.trim() || "openid profile";
  const url = oidc.buildAuthorizationUrl(config, {
    redirect_uri: callbackUrl,
    scope: scopes,
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: "S256"
  });
  return url.href;
}

// ─── OIDC Callback Handler ───

export async function handleOIDCCallback(
  callbackUrl: URL,
  expectedState: string,
  expectedNonce: string,
  codeVerifier: string
): Promise<{ sub: string; claims: Record<string, unknown> }> {
  const config = await getOIDCConfig();

  const tokens = await oidc.authorizationCodeGrant(config, callbackUrl, {
    pkceCodeVerifier: codeVerifier,
    expectedState,
    expectedNonce,
    idTokenExpected: true
  });

  const claims = tokens.claims();
  if (!claims || !claims.sub) {
    throw new Error("Invalid id_token: missing sub claim");
  }

  return {
    sub: String(claims.sub),
    claims: claims as Record<string, unknown>
  };
}

// ─── OAuth 2.0 Callback Handler ───

async function oauth2TokenExchange(
  code: string,
  codeVerifier: string,
  redirectUri: string
): Promise<string> {
  if (!authSettings().ssoTokenUrl) throw new Error("OAuth 2.0 Token URL is not configured");

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: authSettings().ssoClientId,
    client_secret: authSettings().ssoClientSecret,
    code_verifier: codeVerifier
  });

  const res = await fetch(authSettings().ssoTokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json"
    },
    body: body.toString()
  });

  if (!res.ok) {
    const text = await res.text();
    logger().error(`[SSO] OAuth 2.0 token exchange failed (${res.status}): ${text}`);
    throw new Error(`OAuth 2.0 token exchange failed: ${res.status}`);
  }

  const data = await res.json();
  const accessToken = data.access_token;
  if (!accessToken) {
    throw new Error("OAuth 2.0 token response missing access_token");
  }
  return String(accessToken);
}

async function oauth2Userinfo(accessToken: string): Promise<Record<string, unknown>> {
  if (!authSettings().ssoUserinfoUrl) throw new Error("OAuth 2.0 Userinfo URL is not configured");

  const res = await fetch(authSettings().ssoUserinfoUrl, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json"
    }
  });

  if (!res.ok) {
    const text = await res.text();
    logger().error(`[SSO] OAuth 2.0 userinfo failed (${res.status}): ${text}`);
    throw new Error(`OAuth 2.0 userinfo request failed: ${res.status}`);
  }

  return (await res.json()) as Record<string, unknown>;
}

export async function handleOAuth2Callback(
  code: string,
  codeVerifier: string,
  ctx?: Koa.ParameterizedContext
): Promise<{ sub: string; claims: Record<string, unknown> }> {

  const redirectUri = getCallbackUrl(ctx);
  const accessToken = await oauth2TokenExchange(code, codeVerifier, redirectUri);
  const userinfo = await oauth2Userinfo(accessToken);

  const idField = authSettings().ssoUserIdField || "id";
  const userId = userinfo[idField];
  if (userId == null || userId === "") {
    throw new Error(`OAuth 2.0 userinfo response missing field: ${idField}`);
  }

  const sub = `oauth2:${String(userId)}`;
  logger().info(`[SSO] OAuth 2.0 userinfo resolved: ${idField}=${userId}`);

  return { sub, claims: userinfo };
}

// ─── Shared Utilities ───

export function getCallbackUrl(ctx?: Koa.ParameterizedContext): string {
  if (authSettings().ssoCallbackUrl) return authSettings().ssoCallbackUrl;
  const prefix = corePrefix();
  if (ctx) {
    const proto = (ctx.get("X-Forwarded-Proto") || ctx.protocol || "http").split(",")[0].trim();
    const host = (ctx.get("X-Forwarded-Host") || ctx.get("Host") || "").split(",")[0].trim();
    if (host) {
      return `${proto}://${host}${prefix}/api/auth/sso/callback`;
    }
  }
  const port = corePort();
  return `http://localhost:${port}${prefix}/api/auth/sso/callback`;
}

export { publicSsoConfig as getPublicSsoConfig } from "./auth_settings";
