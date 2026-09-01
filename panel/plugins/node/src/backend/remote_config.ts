import { removeTrail } from "mcsmanager-common";
import type { ManagerOptions, SocketOptions } from "socket.io-client";
import type { RemoteMappingEntry } from "../../../../src/app/entity/entity_interface";

// @Entity
//
// The stored configuration of one daemon node. It moved out of the core's
// `entity_interface.ts` with the rest of the subsystem: the core only ever reads
// it through the `PanelRemoteNodeConfig` shape it declares, and this class is
// what the storage subsystem instantiates under the `RemoteServiceConfig`
// category — the category name is a string, so existing data still loads.
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
   * To keep the remote mapping inside response consistent with other parts,
   * a simple conversion needs to be made.
   *
   * This is intentionally a method instead of a getter member, as the
   * conversion involves list operation.
   *
   * @returns converted remote mappings
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
