/** Instance category identifiers shared by plugins. */
export const TYPE_UNIVERSAL = "universal";
export const TYPE_MINECRAFT_JAVA = "minecraft/java";
export const TYPE_MINECRAFT_BEDROCK = "minecraft/bedrock";
export const TYPE_MINECRAFT_BUNGEECORD = "minecraft/java/bungeecord";
export const TYPE_STEAM_SERVER_UNIVERSAL = "steam/universal";
export const TYPE_HYTALE = "hytale";
export const TYPE_TERRARIA = "steam/terraria";

/** The seven selectable categories. */
export const INSTANCE_TYPES = [
  TYPE_UNIVERSAL,
  TYPE_MINECRAFT_JAVA,
  TYPE_MINECRAFT_BEDROCK,
  TYPE_MINECRAFT_BUNGEECORD,
  TYPE_STEAM_SERVER_UNIVERSAL,
  TYPE_HYTALE,
  TYPE_TERRARIA
] as const;

export type InstanceType = (typeof INSTANCE_TYPES)[number];

export enum QUICKSTART_ACTION_TYPE {
  Minecraft = "minecraft",
  Bedrock = "bedrock",
  Hytale = "hytale",
  Terraria = "terraria",
  SteamGameServer = "steam",
  Docker = "docker",
  AnyApp = "universal"
}

export enum QUICKSTART_METHOD {
  FAST = "FAST",
  FILE = "FILE",
  IMPORT = "IMPORT",
  SELECT = "SELECT",
  EXIST = "EXIST",
  DOCKER = "DOCKER",
  DOWNLOAD = "DOWNLOAD"
}
