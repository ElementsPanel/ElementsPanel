import net from "net";

export interface MinecraftPingResponse {
  host: string;
  port: number;
  online: boolean;
  version: string;
  motd: string;
  current_players: number;
  max_players: number;
  latency: number;
}

export default class PingMinecraftServer {
  public status: MinecraftPingResponse;
  public client?: net.Socket;
  private pending?: Promise<MinecraftPingResponse>;

  constructor(
    public port: number,
    public host: string
  ) {
    this.status = this.offlineStatus();
  }

  private offlineStatus(): MinecraftPingResponse {
    return {
      online: false,
      host: this.host,
      port: this.port,
      version: "",
      motd: "",
      current_players: 0,
      max_players: 0,
      latency: 0
    };
  }

  getStatus(): Promise<MinecraftPingResponse> {
    if (this.pending) return this.pending;
    this.status = this.offlineStatus();
    this.pending = new Promise<MinecraftPingResponse>((resolve, reject) => {
      const startedAt = Date.now();
      const client = net.connect({ host: this.host, port: this.port });
      this.client = client;
      let received = Buffer.alloc(0);
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        client.destroy();
        this.client = undefined;
        if (error) reject(error);
        else resolve(this.status);
      };
      const timeout = setTimeout(
        () => finish(new Error("Minecraft status request timed out")),
        15000
      );
      client.once("connect", () => client.write(Buffer.from([0xfe, 0x01])));
      client.on("data", (chunk: Buffer) => {
        if (settled) return;
        try {
          received = Buffer.concat([received, chunk]);
          // Legacy status packets contain an unsigned UTF-16 character count.
          if (received.length > 3 + 0xffff * 2)
            throw new Error("Minecraft status response is too large");
          if (received.length < 3) return;
          if (received[0] !== 0xff) throw new Error("Invalid Minecraft status packet");
          const length = 3 + received.readUInt16BE(1) * 2;
          if (received.length < length) return;
          const fields = Buffer.from(received.subarray(3, length))
            .swap16()
            .toString("utf16le")
            .split("\0");
          if (
            fields.length !== 6 ||
            fields[0] !== "§1" ||
            !/^\d+$/.test(fields[4]) ||
            !/^\d+$/.test(fields[5])
          ) {
            throw new Error("Invalid Minecraft status response");
          }
          const currentPlayers = Number(fields[4]);
          const maxPlayers = Number(fields[5]);
          if (!Number.isSafeInteger(currentPlayers) || !Number.isSafeInteger(maxPlayers)) {
            throw new Error("Invalid Minecraft player count");
          }
          this.status = {
            host: this.host,
            port: this.port,
            online: true,
            version: fields[2],
            motd: fields[3],
            current_players: currentPlayers,
            max_players: maxPlayers,
            latency: Date.now() - startedAt
          };
          finish();
        } catch (error) {
          finish(error instanceof Error ? error : new Error(String(error)));
        }
      });
      client.once("error", finish);
      client.once("close", () =>
        finish(received.length ? new Error("Incomplete Minecraft status response") : undefined)
      );
    }).finally(() => {
      this.pending = undefined;
    });
    return this.pending;
  }

  asyncStatus() {
    return this.getStatus();
  }
}
