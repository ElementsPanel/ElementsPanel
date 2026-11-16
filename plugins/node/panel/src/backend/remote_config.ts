import { removeTrail } from "mcsmanager-common";
import type { ManagerOptions, SocketOptions } from "socket.io-client";
import type { RemoteMappingEntry } from "../../../../../core/panel/src/app/plugin/packets";

// Keep the RemoteServiceConfig storage category unchanged so existing node records still load.
export class RemoteServiceConfig {
  public ip = "";
  public port = 24444;
  public prefix = "";
  public remarks = "";
  public apiKey = "";
  public remoteMappings: RemoteMappingEntry[] = [];
  public brand = "";

  connectOpts: Partial<SocketOptions & ManagerOptions> = {
    multiplex: false,
    reconnectionDelayMax: 1000 * 5,
    timeout: 1000 * 10,
    reconnection: true,
    reconnectionAttempts: 10,
    rejectUnauthorized: false
  };

  /**
   * Convert stored mappings to the response shape. Use a method because conversion processes
   * the list.
   */
  public getConvertedRemoteMappings() {
    return this.remoteMappings.map((remote) => ({
      from: {
        addr: `${remote.from.ip}:${remote.from.port}`,
        prefix: remote.from.prefix
      },
      to: {
        addr: `${remote.to.ip}:${remote.to.port}`,
        prefix: remote.to.prefix
      }
    }));
  }

  /**
   * IP concatenated with port.
   */
  public get addr() {
    return `${this.ip}:${this.port}`;
  }

  /**
   * The prefix trimmed and removed trailing slash.
   */
  public get canonicalPrefix() {
    return removeTrail(this.prefix.trim(), "/");
  }

  /**
   * Full address containing IP, port and prefix.
   */
  public get fullAddr() {
    return this.addr + this.canonicalPrefix;
  }
}
