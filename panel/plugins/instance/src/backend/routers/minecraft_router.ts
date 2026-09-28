import Router from "@koa/router";
import type {
  MinecraftInstallOptions,
  MinecraftServerSelection
} from "../../../../../../common/src/minecraft";
import { $t, identity, middleware, operations, remote, roles } from "../runtime";
import { MslMirrorsService } from "../service/msl_mirrors";

export function createMinecraftRouter() {
  const router = new Router({ prefix: "/instance/minecraft" });
  const mirrors = new MslMirrorsService();
  router.use(middleware().permission({ level: roles().ADMIN }));

  const capability = async (request: InstanceType<ReturnType<typeof remote>["Request"]>) => {
    const overview = await request.request("info/overview");
    return { supported: overview?.features?.minecraftInstall === true };
  };

  router.get(
    "/capability",
    middleware().validator({ query: { daemonId: String } }),
    async (ctx) => {
      try {
        const service = remote().services.getInstance(String(ctx.query.daemonId));
        ctx.body = await capability(new (remote().Request)(service));
      } catch (error) {
        ctx.body = error;
      }
    }
  );

  router.get("/servers", async (ctx) => {
    try {
      ctx.body = await mirrors.servers();
    } catch (error) {
      ctx.body = error;
    }
  });
  router.get("/versions", middleware().validator({ query: { server: String } }), async (ctx) => {
    try {
      ctx.body = await mirrors.versions(String(ctx.query.server));
    } catch (error) {
      ctx.body = error;
    }
  });
  router.get(
    "/builds",
    middleware().validator({ query: { server: String, version: String } }),
    async (ctx) => {
      try {
        ctx.body = await mirrors.builds(String(ctx.query.server), String(ctx.query.version));
      } catch (error) {
        ctx.body = error;
      }
    }
  );

  router.post(
    "/",
    middleware().validator({
      query: { daemonId: String },
      body: { selection: Object, config: Object }
    }),
    async (ctx) => {
      try {
        const selection = ctx.request.body.selection as MinecraftServerSelection;
        const config = ctx.request.body.config as IGlobalInstanceConfig;
        if (
          typeof config.nickname !== "string" ||
          !config.nickname.trim() ||
          typeof config.type !== "string" ||
          (selection.javaPath != null &&
            (typeof selection.javaPath !== "string" || /["\r\n\0]/.test(selection.javaPath)))
        ) {
          throw new Error($t("TXT_CODE_minecraft.invalidSelection"));
        }
        const daemonId = String(ctx.query.daemonId);
        const service = remote().services.getInstance(daemonId);
        const request = new (remote().Request)(service);
        if (!(await capability(request)).supported)
          throw new Error($t("TXT_CODE_minecraft.nodeUnsupported"));
        const download = await mirrors.resolve(selection, config.type);
        const minecraft: MinecraftInstallOptions = {
          server: selection.server,
          version: selection.version,
          kind: download.kind,
          sha256: download.sha256,
          javaPath: selection.javaPath?.trim() || "java"
        };
        const result = await request.request("instance/asynchronous", {
          instanceUuid: "-",
          taskName: "minecraft_install",
          role: identity().identify(ctx).role,
          parameter: {
            newInstanceName: config.nickname.trim(),
            targetLink: download.url,
            setupInfo: { ...config, type: download.type, cwd: "", processType: "general" },
            minecraft
          }
        });
        if (!result?.instanceUuid) throw new Error($t("TXT_CODE_minecraft.nodeUnsupported"));
        operations().log("instance_create", {
          daemon_id: daemonId,
          instance_id: result.instanceUuid,
          operator_ip: ctx.ip,
          operator_name: identity().identify(ctx).userName,
          instance_name: config.nickname
        });
        ctx.body = result;
      } catch (error) {
        ctx.body = error;
      }
    }
  );
  return router;
}
