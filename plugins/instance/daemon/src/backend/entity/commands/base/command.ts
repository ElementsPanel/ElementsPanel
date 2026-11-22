import Instance from "../../instance/instance";
import { IExecutable } from "../../instance/preset";

export default class InstanceCommand implements IExecutable<Instance> {
  constructor(public info?: string) {}
  async exec(_instance: Instance): Promise<any> {}
  async stop(_instance: Instance) {}
}
