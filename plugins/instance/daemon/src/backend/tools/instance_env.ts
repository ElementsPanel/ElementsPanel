const PANEL_RUNTIME_ENV_PATTERNS = [
  /^NODE_ENV$/i,
  /^EPANEL_/i,
  /^INIT_CWD$/i,
  /^npm_(?:command|execpath|node_execpath|lifecycle_|package_)/i,
  /^npm_config_(?:local_prefix|global_prefix|globalconfig|prefix|user_agent|npm_version)$/i
];

/** Remove panel runtime and npm launcher variables before spawning instance processes. */
export function sanitizeInstanceEnv(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) continue;
    if (PANEL_RUNTIME_ENV_PATTERNS.some((pattern) => pattern.test(key))) continue;
    env[key] = value;
  }
  return env;
}
