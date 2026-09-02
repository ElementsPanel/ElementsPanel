import dgram from "dgram";
import { MCServerStatus, toNumber } from "mcsmanager-common";
import type InstanceEntity from "../../../../src/entity/instance/instance";
import type { DaemonPluginContext } from "../../../../src/plugin";

const JAVA_TYPE = "minecraft/java";
const BEDROCK_TYPE = "minecraft/bedrock";

function isMinecraft(instance: InstanceEntity) {
  const type = String(instance.config?.type ?? "");
  return type.startsWith(JAVA_TYPE) || type.startsWith(BEDROCK_TYPE);
}

async function requestBedrockStatus(ip: string, port: number): Promise<string[]> {
  const message = Buffer.from(
    "01 00 00 00 00 00 06 18 20 00 FF FF 00 FE FE FE FE FD FD FD FD 12 34 56 78 A3 61 1C F8 BA 8F D5 60".replace(
      / /g,
      ""
    ),
    "hex"
  );
  const client = dgram.createSocket("udp4");

  return await new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error, result?: string[]) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      try {
        client.close();
      } catch {
        // The socket may already be closed after an error.
      }
      if (error) reject(error);
      else resolve(result ?? []);
    };

    const timeout = setTimeout(
      () => finish(new Error("Minecraft Bedrock status request timeout")),
      3000
    );
    client.on("error", (error) => finish(error));
    client.on("message", (data) => finish(undefined, data.toString().split(";")));
    client.send(message, port, ip, (error) => {
      if (error) finish(error);
    });
  });
}

export function createMinecraftStatusCommandClass(ctx: DaemonPluginContext) {
  const { Command: InstanceCommand } = ctx.instances;

  return class MinecraftStatusCommand extends InstanceCommand {
    constructor() {
      super("MinecraftStatusCommand");
    }

    async exec(instance: InstanceEntity) {
      const type = String(instance.config?.type ?? "");
      const pingConfig = instance.config?.pingConfig;
      const ip = pingConfig?.ip || "localhost";
      const port = Number(pingConfig?.port || 0);
      if (!port || !isMinecraft(instance)) return null;

      try {
        if (type.startsWith(JAVA_TYPE)) {
          const result = await new MCServerStatus(port, ip).getStatus();
          if (!result.online) {
            instance.resetPingInfo();
            return result;
          }
          instance.info.mcPingOnline = true;
          instance.info.currentPlayers = toNumber(result.current_players) ?? 0;
          instance.info.maxPlayers = toNumber(result.max_players) ?? 0;
          instance.info.version = result.version || "";
          instance.info.latency = toNumber(result.latency) ?? 0;
          return result;
        }

        const info = await requestBedrockStatus(ip, port);
        instance.info.mcPingOnline = true;
        instance.info.currentPlayers = toNumber(info[4]) ?? 0;
        instance.info.maxPlayers = toNumber(info[5]) ?? 0;
        instance.info.version = info[3] || "";
        instance.info.latency = 0;
        return {
          version: info[3],
          motd: info[0],
          current_players: info[4],
          max_players: info[5]
        };
      } catch {
        instance.resetPingInfo();
        return null;
      }
    }
  };
}

export function createMinecraftStatusTaskClass(ctx: DaemonPluginContext) {
  return class MinecraftStatusTask {
    public status = 0;
    public name = "MinecraftStatus";
    private stopTask?: () => void;

    async start(instance: InstanceEntity) {
      this.stopTask = ctx.setInterval(() => {
        void instance.execPreset("refreshPlayers").catch(() => {
          // The preset disappears cleanly when the plugin is disabled.
        });
      }, 1000 * 60);
    }

    async stop(instance: InstanceEntity) {
      instance.resetPingInfo();
      this.stopTask?.();
      this.stopTask = undefined;
    }
  };
}

export const inject = ["instances", "presets", "instanceLifecycle", "features"];

export function apply(ctx: DaemonPluginContext) {
  const MinecraftStatusCommand = createMinecraftStatusCommandClass(ctx);
  const MinecraftStatusTask = createMinecraftStatusTaskClass(ctx);

  ctx.features.add("mcstats");
  ctx.presets.register("refreshPlayers", () => new MinecraftStatusCommand());
  ctx.instanceLifecycle.register((instance) =>
    isMinecraft(instance) ? new MinecraftStatusTask() : undefined
  );

  ctx.on("dispose", () => {
    for (const instance of ctx.instances.subsystem.getInstances()) {
      if (isMinecraft(instance)) instance.resetPingInfo();
    }
  });
}
