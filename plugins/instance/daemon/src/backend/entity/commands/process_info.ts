import pidusage from "pidusage";
import InstanceCommand from "./base/command";
import Instance from "../instance/instance";

export default class ProcessInfoCommand extends InstanceCommand {
  constructor() {
    super("ProcessInfo");
  }
  async exec(instance: Instance): Promise<Object> {
    let info: any = {
      cpu: 0, // CPU percentage, up to 100 per core.
      memory: 0, // bytes
      ppid: 0,
      pid: 0,
      ctime: 0, // ms user + system time
      elapsed: 0, // ms since the start of the process
      timestamp: 0 // ms since epoch
    };
    if (instance.process && instance.process.pid) {
      info = await pidusage(instance.process.pid);
    }
    return info;
  }
}
