/** Wire format for the panel's Minecraft download and daemon installation APIs. */
export interface MinecraftServerSelection {
  server: string;
  version: string;
  build: string;
  javaPath?: string;
}

export interface MinecraftInstallOptions {
  server: string;
  version: string;
  kind: "jar" | "forge" | "neoforge" | "bedrock";
  sha256?: string;
  javaPath?: string;
}
