import { EventEmitter } from "events";

export interface IInstanceProcess extends EventEmitter {
  pid?: number | string;
  kill: (signal?: any) => any;
  destroy: () => void | Promise<void>;
  write: (data?: any) => any;
  snapshot?: (metadata: Record<string, unknown>) => void;
}
