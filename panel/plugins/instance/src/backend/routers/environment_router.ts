import Router from "@koa/router";
import axios from "axios";
import { normalizeDockerPlatform } from "mcsmanager-common";
import { middleware, remote, roles } from "../runtime";

/** HTTP facade for Docker environment operations exposed by a daemon. */
export function createEnvironmentRouter() {
  const router = new Router({ prefix: "/environment" });
  const ROLE = roles();
  const permission = middleware().permission;
  const validator = middleware().validator;
  const remoteSubsystem = () => remote().services;
  const remoteRequest = (service: any) => new (remote().Request)(service);

  const daemonQuery = { daemonId: String };

  router.get(
    "/image",
    permission({ level: ROLE.ADMIN }),
    validator({ query: daemonQuery }),
    async (ctx) => {
      try {
        const remoteService = remoteSubsystem().getInstance(String(ctx.query.daemonId));
        ctx.body = await remoteRequest(remoteService).request("environment/images", {});
      } catch (error) {
        ctx.body = error;
      }
    }
  );

  router.post(
    "/image",
    permission({ level: ROLE.ADMIN }),
    validator({ query: daemonQuery }),
    async (ctx) => {
      try {
        const remoteService = remoteSubsystem().getInstance(String(ctx.query.daemonId));
        ctx.body = await remoteRequest(remoteService).request(
          "environment/new_image",
          ctx.request.body
        );
      } catch (error) {
        ctx.body = error;
      }
    }
  );

  router.delete(
    "/image",
    permission({ level: ROLE.ADMIN }),
    validator({ query: { daemonId: String, imageId: String } }),
    async (ctx) => {
      try {
        const remoteService = remoteSubsystem().getInstance(String(ctx.query.daemonId));
        ctx.body = await remoteRequest(remoteService).request("environment/del_image", {
          imageId: String(ctx.query.imageId)
        });
      } catch (error) {
        ctx.body = error;
      }
    }
  );

  router.get(
    "/containers",
    permission({ level: ROLE.ADMIN }),
    validator({ query: daemonQuery }),
    async (ctx) => {
      try {
        const remoteService = remoteSubsystem().getInstance(String(ctx.query.daemonId));
        ctx.body = await remoteRequest(remoteService).request("environment/containers", {});
      } catch (error) {
        ctx.body = error;
      }
    }
  );

  router.get(
    "/networkModes",
    permission({ level: ROLE.ADMIN }),
    validator({ query: daemonQuery }),
    async (ctx) => {
      try {
        const remoteService = remoteSubsystem().getInstance(String(ctx.query.daemonId));
        ctx.body = await remoteRequest(remoteService).request("environment/networkModes", {});
      } catch (error) {
        ctx.body = error;
      }
    }
  );

  router.get(
    "/progress",
    permission({ level: ROLE.ADMIN }),
    validator({ query: daemonQuery }),
    async (ctx) => {
      try {
        const remoteService = remoteSubsystem().getInstance(String(ctx.query.daemonId));
        ctx.body = await remoteRequest(remoteService).request("environment/progress", {});
      } catch (error) {
        ctx.body = error;
      }
    }
  );

  router.post(
    "/image_platforms",
    permission({ level: ROLE.ADMIN }),
    validator({ query: daemonQuery }),
    async (ctx) => {
      try {
        const imageName = (ctx.request.body as { imageName?: string })?.imageName;
        if (!imageName) {
          ctx.body = { status: 400, message: "Image name is required" };
          return;
        }
        const remoteService = remoteSubsystem().getInstance(String(ctx.query.daemonId));
        ctx.body = await remoteRequest(remoteService).request("environment/image_platforms", {
          imageName
        });
      } catch (error) {
        ctx.body = error;
      }
    }
  );

  router.post("/dockerhub_image_platforms", permission({ level: ROLE.ADMIN }), async (ctx) => {
    try {
      const imageName = (ctx.request.body as { imageName?: string })?.imageName;
      if (!imageName) {
        ctx.body = { status: 400, message: "Image name is required" };
        return;
      }

      // Parse image:tag, namespace/image:tag, or registry/namespace/image:tag.
      const parts = imageName.split("/");
      let registry = "registry-1.docker.io";
      let repository: string;
      let tag = "latest";

      if (parts.length === 1) {
        const [image, imageTag] = parts[0].includes(":")
          ? parts[0].split(":")
          : [parts[0], "latest"];
        repository = `library/${image}`;
        tag = imageTag;
      } else if (parts.length === 2) {
        if (parts[0].includes(".") || parts[0].includes(":")) {
          registry = parts[0];
          const [image, imageTag] = parts[1].includes(":")
            ? parts[1].split(":")
            : [parts[1], "latest"];
          repository = image;
          tag = imageTag;
        } else {
          const [image, imageTag] = parts[1].includes(":")
            ? parts[1].split(":")
            : [parts[1], "latest"];
          repository = `${parts[0]}/${image}`;
          tag = imageTag;
        }
      } else {
        registry = parts[0];
        const lastPart = parts[parts.length - 1];
        const [image, imageTag] = lastPart.includes(":")
          ? lastPart.split(":")
          : [lastPart, "latest"];
        repository = parts.slice(1, -1).concat(image).join("/");
        tag = imageTag;
      }

      const registryUrl = registry.includes("://") ? registry : `https://${registry}`;
      const isDockerHub = registry === "registry-1.docker.io" || registry === "docker.io";
      let token = "";
      if (isDockerHub) {
        try {
          const tokenResponse = await axios.get(
            `https://auth.docker.io/token?service=registry.docker.io&scope=repository:${repository}:pull`,
            { timeout: 3000 }
          );
          token = tokenResponse.data.token || tokenResponse.data.access_token || "";
        } catch {
          // Public images can still be queried without a token.
        }
      }

      const headers: Record<string, string> = {
        Accept:
          "application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.docker.distribution.manifest.v2+json, application/vnd.oci.image.index.v1+json, application/vnd.oci.image.manifest.v1+json"
      };
      if (token) headers.Authorization = `Bearer ${token}`;

      const manifestResponse = await axios.get(
        `${registryUrl}/v2/${repository}/manifests/${tag}`,
        { headers, timeout: 3000 }
      );
      const platforms: string[] = [];
      if (manifestResponse.data?.manifests instanceof Array) {
        for (const manifest of manifestResponse.data.manifests) {
          if (manifest.platform) platforms.push(normalizeDockerPlatform(manifest.platform));
        }
      }
      ctx.body = platforms;
    } catch {
      // Keep the proxy endpoint non-fatal for image creation forms.
      ctx.body = [];
    }
  });

  return router;
}
