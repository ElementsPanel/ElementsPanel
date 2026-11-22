import {
  mapDaemonAddress,
  type RemoteMappingEntry
} from "@elementspanel/epanel-plugin-console/tools/protocol";

export function getFileConfigAddr(config: { addr: string; remoteMappings?: RemoteMappingEntry[] }) {
  let addr = config.addr;
  if (config.remoteMappings) {
    const mapped = mapDaemonAddress(config.remoteMappings);
    if (mapped) {
      addr = mapped.addr + mapped.prefix;
    }
  }
  return addr;
}
