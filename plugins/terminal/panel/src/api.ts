import { useDefineApi } from "@/stores/useDefineApi";
import type { RemoteMappingEntry } from "@/tools/protocol";

export interface MissionPassportResponse {
  addr: string;
  password: string;
  prefix: string;
  remoteMappings: RemoteMappingEntry[];
}

export const setUpTerminalStreamChannel = useDefineApi<
  {
    params: {
      daemonId: string;
      uuid: string;
    };
  },
  MissionPassportResponse
>({
  url: "/api/protected_instance/stream_channel",
  method: "POST"
});

export const getInstanceOutputLog = useDefineApi<
  {
    params: {
      uuid: string;
      daemonId: string;
    };
  },
  string
>({
  url: "/api/protected_instance/outputlog",
  method: "GET"
});
