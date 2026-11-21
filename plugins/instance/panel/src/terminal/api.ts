import { useDefineApi } from "@elementspanel/epanel-plugin-console/stores/useDefineApi";
import type { RemoteMappingEntry } from "@elementspanel/epanel-plugin-console/tools/protocol";
import type { TerminalSettings } from "../../../shared/terminal_settings";

export interface MissionPassportResponse {
  addr: string;
  password: string;
  prefix: string;
  remoteMappings: RemoteMappingEntry[];
  terminalSettings?: TerminalSettings;
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
