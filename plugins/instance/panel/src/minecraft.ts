import type { MinecraftInstallOptions } from "../../../../core/common/src/minecraft";
import {
  TYPE_MINECRAFT_JAVA,
  TYPE_MINECRAFT_BEDROCK,
  TYPE_MINECRAFT_BUNGEECORD,
  type InstanceType
} from "../../../../core/common/src/instance_contract";

interface MinecraftServer {
  title: string;
  type: InstanceType;
  kind: MinecraftInstallOptions["kind"];
  stopCommand: string;
}

const java = (title: string, type: InstanceType = TYPE_MINECRAFT_JAVA): MinecraftServer => ({
  title,
  type,
  kind: "jar",
  stopCommand: "stop"
});

const proxy = (title: string, stopCommand = "end"): MinecraftServer => ({
  ...java(title, TYPE_MINECRAFT_BUNGEECORD),
  stopCommand
});

// Only advertise artifacts that can be installed as a standalone server. For
// example, SpongeForge is a Forge mod and cannot be launched as a server JAR.
export const MINECRAFT_SERVERS: Record<string, MinecraftServer> = {
  vanilla: java("Vanilla"),
  "vanilla-snapshot": java("Vanilla Snapshot"),
  paper: java("Paper"),
  purpur: java("Purpur"),
  leaf: java("Leaf"),
  leaves: java("Leaves"),
  spigot: java("Spigot"),
  bukkit: java("Bukkit"),
  folia: java("Folia"),
  pufferfish: java("Pufferfish"),
  pufferfish_purpur: java("Pufferfish Purpur"),
  fabric: java("Fabric"),
  forge: { ...java("Forge"), kind: "forge" },
  neoforge: { ...java("NeoForge"), kind: "neoforge" },
  "arclight-forge": java("Arclight Forge"),
  "arclight-fabric": java("Arclight Fabric"),
  "arclight-neoforge": java("Arclight NeoForge"),
  spongevanilla: java("SpongeVanilla"),
  youer: java("Youer"),
  mohist: java("Mohist"),
  catserver: java("CatServer"),
  banner: java("Banner"),
  lightfall: proxy("Lightfall"),
  travertine: proxy("Travertine"),
  bungeecord: proxy("BungeeCord"),
  velocity: proxy("Velocity", "shutdown"),
  "bedrock-server": {
    title: "Bedrock Dedicated Server",
    type: TYPE_MINECRAFT_BEDROCK,
    kind: "bedrock",
    stopCommand: "stop"
  },
  nukkitx: java("Nukkit", TYPE_MINECRAFT_BEDROCK)
};

export function minecraftServersForType(servers: string[], type: string) {
  return servers.filter((server) => {
    const entry = Object.prototype.hasOwnProperty.call(MINECRAFT_SERVERS, server)
      ? MINECRAFT_SERVERS[server]
      : undefined;
    if (!entry) return false;
    return entry.type === type;
  });
}

export function defaultMinecraftServer(servers: string[], type: string) {
  const preferred =
    type === TYPE_MINECRAFT_JAVA
      ? "vanilla"
      : type === TYPE_MINECRAFT_BEDROCK
      ? "bedrock-server"
      : "bungeecord";
  return servers.find((server) => server === preferred) || servers[0] || "";
}
