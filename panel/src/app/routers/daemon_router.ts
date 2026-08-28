import Router from "@koa/router";
import { ROLE } from "../entity/user";
import permission from "../middleware/permission";
import validator from "../middleware/validator";
import RemoteRequest from "../service/remote_command";
import RemoteServiceSubsystem from "../service/remote_service";

// Node (daemon) management lives in the "node" panel plugin, which owns
// /api/service/remote_service(s)* and /api/service/link_remote_service.
// Only instance browsing stays here, because the core frontend uses it to pick
// instances regardless of whether the node plugin is installed.
const router = new Router({ prefix: "/service" });

// [Top-level Permission]
// Query the daemon for the specified instance
router.get(
  "/remote_service_instances",
  permission({ level: ROLE.ADMIN }),
  validator({ query: { daemonId: String, page: Number, page_size: Number } }),
  async (ctx) => {
    const daemonId = String(ctx.query.daemonId);
    const page = Math.max(1, Number(ctx.query.page) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(ctx.query.page_size) || 10));
    const instanceName = ctx.query.instance_name;
    const status = ctx.query.status;
    const tag = String(ctx.query.tag);
    const remoteService = RemoteServiceSubsystem.getInstance(daemonId);
    let tagList: string[] = [];
    try {
      tagList = JSON.parse(tag);
    } catch (error) {
      // ignore
    }
    const result = await new RemoteRequest(remoteService).request("instance/select", {
      page,
      pageSize,
      condition: {
        instanceName,
        status,
        tag: tagList.length > 0 ? tagList : null
      }
    });
    ctx.body = result;
  }
);

export default router;
