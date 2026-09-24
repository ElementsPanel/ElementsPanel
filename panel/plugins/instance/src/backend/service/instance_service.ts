import { toText } from "mcsmanager-common";
import { identity, remote, $t } from "../runtime";

export enum INSTANCE_STATUS {
  BUSY = -1,
  STOP = 0,
  STOPPING = 1,
  STARTING = 2,
  RUNNING = 3
}
export const INSTANCE_STATUS_TEXT: Record<number, string> = {
  get [INSTANCE_STATUS.BUSY]() {
    return $t("TXT_CODE_342a04a9");
  },
  get [INSTANCE_STATUS.STOP]() {
    return $t("TXT_CODE_15f2e564");
  },
  get [INSTANCE_STATUS.STOPPING]() {
    return $t("TXT_CODE_a409b8a9");
  },
  get [INSTANCE_STATUS.STARTING]() {
    return $t("TXT_CODE_175b570d");
  },
  get [INSTANCE_STATUS.RUNNING]() {
    return $t("TXT_CODE_bdb620b9");
  }
};

export interface IAdvancedInstanceInfo {
  instanceUuid: string;
  daemonId: string;
  hostIp?: string;
  remarks?: string;
  status?: number;
  nickname?: string;
  ie?: string;
  oe?: string;
  endTime?: number;
  lastDatetime?: number;
  stopCommand?: string;
  processType?: string;
  docker?: Record<string, any>;
  info?: Record<string, any>;
}

// Multi-forward operation method
export async function multiOperationForwarding(
  instances: unknown,
  callback: (daemonId: string, instanceUuids: string[]) => Promise<void>
) {
  if (!Array.isArray(instances)) throw new Error("Instances must be an array");
  // classification table
  const map = new Map<string, string[]>();
  // Classify remote hosts and instance IDs based on information
  for (const instanceInfo of instances) {
    if (
      !instanceInfo ||
      typeof instanceInfo.daemonId !== "string" ||
      !instanceInfo.daemonId ||
      typeof instanceInfo.instanceUuid !== "string" ||
      !instanceInfo.instanceUuid
    )
      throw new Error("Invalid instance reference");
    const daemonId: string = instanceInfo.daemonId;
    const instanceUuid: string = instanceInfo.instanceUuid;
    if (map.has(daemonId)) {
      map.get(daemonId)?.push(instanceUuid);
    } else {
      map.set(daemonId, [instanceUuid]);
    }
  }
  // Pack and forward the classified data separately
  const failures = await Promise.all(
    Array.from(map, async ([daemonId, instanceUuids]) => {
      try {
        await callback(daemonId, [...new Set(instanceUuids)]);
        return undefined;
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    })
  );
  const messages = failures.filter((failure): failure is string => failure !== undefined);
  if (messages.length) throw new Error(messages.join("\n"));
}

export async function getInstanceDetails(
  instances: readonly { instanceUuid: string; daemonId: string }[]
): Promise<IAdvancedInstanceInfo[]> {
  const resInstances: IAdvancedInstanceInfo[] = [];
  for (const iterator of instances) {
    const remoteService = remote().services.getInstance(iterator.daemonId);
    if (!remoteService || !remoteService.available) {
      // If the remote service doesn't exist at all, load a deleted prompt
      resInstances.push({
        hostIp: "-- Unknown --",
        instanceUuid: iterator.instanceUuid,
        daemonId: iterator.daemonId,
        status: -1,
        nickname: "-- Unknown --",
        remarks: "",
        ie: "",
        oe: "",
        endTime: 0,
        lastDatetime: 0,
        stopCommand: "",
        processType: "",
        docker: {},
        info: {}
      });
      continue;
    }
    // Note: UUID can be integrated here to save the returned traffic, and this optimization will not be done for the time being
    try {
      let instancesInfo = await new (remote().Request)(remoteService).request(
        "instance/section",
        {
          instanceUuids: [iterator.instanceUuid]
        }
      );
      if (!instancesInfo || instancesInfo.length === 0) continue;
      instancesInfo = instancesInfo[0];
      resInstances.push({
        hostIp: `${remoteService.config.ip}:${remoteService.config.port}`,
        remarks: remoteService.config.remarks,
        instanceUuid: instancesInfo.instanceUuid,
        daemonId: remoteService.uuid,
        status: instancesInfo.status,
        nickname: instancesInfo.config.nickname,
        ie: instancesInfo.config.ie,
        oe: instancesInfo.config.oe,
        endTime: instancesInfo.config.endTime,
        lastDatetime: instancesInfo.config.lastDatetime,
        stopCommand: instancesInfo.config.stopCommand,
        processType: instancesInfo.config.processType,
        docker: instancesInfo.config.docker || {},
        info: instancesInfo.info || {}
      });
    } catch (error) {
      // ignore error
      continue;
    }
  }
  return resInstances;
}

export function checkInstanceAdvancedParams(
  config: IGlobalInstanceConfig,
  isTopPermission: boolean = false
) {
  const canChangeCmd = identity().accessPolicy().allowChangeCmd;
  if (!isTopPermission) {
    if (!canChangeCmd) return {};
    if (config.processType !== "docker") return {};
  }

  const startCommand = toText(config.startCommand);
  const updateCommand = toText(config.updateCommand);
  const dockerEnv = Array.isArray(config.docker?.env) ? config.docker.env : null;

  return {
    startCommand,
    updateCommand,
    docker: {
      env: dockerEnv
    }
  };
}
