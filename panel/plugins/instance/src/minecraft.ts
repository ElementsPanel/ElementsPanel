import type { MinecraftInstallOptions } from "../../../../common/src/minecraft";

interface MinecraftServer {
  title: string;
  type: string;
  kind: MinecraftInstallOptions["kind"];
}

const java = (title: string, type = "minecraft/java"): MinecraftServer => ({
  title,
  type,
  kind: "jar"
});

// Only advertise artifacts that can be installed as a standalone server. For
// example, SpongeForge is a Forge mod and cannot be launched as a server JAR.
export const MINECRAFT_SERVERS: Record<string, MinecraftServer> = {
  vanilla: java("Vanilla"),
  "vanilla-snapshot": java("Vanilla Snapshot"),
  paper: java("Paper", "minecraft/java/paper"),
  purpur: java("Purpur", "minecraft/java/purpur"),
  leaf: java("Leaf"),
  leaves: java("Leaves", "minecraft/java/leaves"),
  spigot: java("Spigot", "minecraft/java/spigot"),
  bukkit: java("Bukkit", "minecraft/java/bukkit"),
  folia: java("Folia", "minecraft/java/folia"),
  pufferfish: java("Pufferfish", "minecraft/java/pufferfish"),
  pufferfish_purpur: java("Pufferfish Purpur", "minecraft/java/pufferfish"),
  fabric: java("Fabric", "minecraft/java/fabric"),
  forge: { title: "Forge", type: "minecraft/java/forge", kind: "forge" },
  neoforge: { title: "NeoForge", type: "minecraft/java/neoforge", kind: "neoforge" },
  "arclight-forge": java("Arclight Forge"),
  "arclight-fabric": java("Arclight Fabric"),
  "arclight-neoforge": java("Arclight NeoForge"),
  spongevanilla: java("SpongeVanilla", "minecraft/java/sponge"),
  youer: java("Youer"),
  mohist: java("Mohist", "minecraft/java/mohist"),
  catserver: java("CatServer"),
  banner: java("Banner"),
  lightfall: java("Lightfall", "minecraft/java/bungeecord"),
  travertine: java("Travertine", "minecraft/java/bungeecord"),
  bungeecord: java("BungeeCord", "minecraft/java/bungeecord"),
  velocity: java("Velocity", "minecraft/java/velocity"),
  "bedrock-server": {
    title: "Bedrock Dedicated Server",
    type: "minecraft/bedrock/bds",
    kind: "bedrock"
  },
  nukkitx: java("Nukkit", "minecraft/bedrock/nukkit")
};

export function minecraftServersForType(servers: string[], type: string) {
  return servers.filter((server) => {
    const entry = Object.prototype.hasOwnProperty.call(MINECRAFT_SERVERS, server)
      ? MINECRAFT_SERVERS[server]
      : undefined;
    if (!entry) return false;
    if (type === "minecraft/java" || type === "minecraft/bedrock") {
      return entry.type === type || entry.type.startsWith(`${type}/`);
    }
    return entry.type === type;
  });
}

export function defaultMinecraftServer(servers: string[], type: string) {
  const preferred =
    type === "minecraft/java"
      ? "vanilla"
      : type === "minecraft/bedrock"
      ? "bedrock-server"
      : type.split("/").pop();
  return servers.find((server) => server === preferred) || servers[0] || "";
}
