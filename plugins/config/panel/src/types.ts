import type { NodeSummary, NodePluginRecord, PluginRecord, PluginGroup } from "./api";

export type Scope = "panel" | "node";
export type PluginAction = "enable" | "disable" | "remove";

export interface NodePluginTarget {
  node: NodeSummary;
  plugin: NodePluginRecord;
}

export interface PluginActionCandidate {
  action: PluginAction;
  step: "checking" | "confirm" | "nodes";
  scope: Scope;
  plugin: PluginRecord | NodePluginRecord;
  nodeId: string;
  checkingNodes: boolean;
  nodeTargets: NodePluginTarget[];
  selectedNodeIds: string[];
  nodeCheckError: string;
  removeConfig: boolean;
}

export interface PluginGroupView extends PluginGroup {
  plugins: Array<PluginRecord | NodePluginRecord>;
  unassigned: boolean;
}
