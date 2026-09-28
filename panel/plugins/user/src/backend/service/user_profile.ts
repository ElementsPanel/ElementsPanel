import type { PanelPluginContext } from "../../../../../src/app/plugin";

/** Accounts own their public profile; instance details are an optional enrichment. */
export async function getUserProfile(
  ctx: PanelPluginContext,
  uuid: string,
  targetDaemonId?: string,
  advanced = false
) {
  const user = ctx.identity.users?.getInstance(uuid);
  if (!user) throw new Error("The UID does not exist");
  const references = user.instances.filter(
    (item) => !targetDaemonId || item.daemonId === targetDaemonId
  );
  const instances = ctx.get("instances");
  let details: any[] = references;
  if (advanced) {
    details = references.map((item) => ({ ...item, status: -1, nickname: "-- Unknown --" }));
    if (instances) {
      try {
        details = await instances.getDetails(references);
      } catch (error) {
        // Losing an optional provider during a request must not break authentication.
        ctx.logger.warn("Unable to enrich account instance references:", error);
      }
    }
  }
  return {
    uuid: user.uuid,
    userName: user.userName,
    loginTime: user.loginTime,
    registerTime: user.registerTime,
    instances: details,
    permission: user.permission,
    apiKey: user.apiKey,
    isInit: user.isInit,
    open2FA: user.open2FA,
    token: ""
  };
}
