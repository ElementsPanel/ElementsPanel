import { addNode, connectNode, deleteNode, editNode } from "../api";

export interface NodeWriteConfig {
  ip?: string;
  port?: number;
  prefix?: string;
  remarks?: string;
  apiKey?: string;
  [key: string]: any;
}

export function useNodeOperations() {
  return {
    add: (data: {
      ip: string;
      port: number;
      remarks: string;
      apiKey: string;
      [key: string]: any;
    }) => addNode().execute({ data }),
    edit: (uuid: string, data: NodeWriteConfig) => editNode().execute({ params: { uuid }, data }),
    remove: (uuid: string) => deleteNode().execute({ params: { uuid } }),
    connect: (uuid: string) => connectNode().execute({ params: { uuid } })
  };
}
