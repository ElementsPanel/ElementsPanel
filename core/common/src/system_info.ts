import os from "os";
import osUtils from "os-utils";
import fs from "fs";

interface IInfoTable {
  [key: string]: number;
}

interface ISystemInfo {
  cpuUsage: number;
  memUsage: number;
  totalmem: number;
  freemem: number;
  type: string;
  hostname: string;
  platform: string;
  release: string;
  uptime: number;
  cwd: string;
  processCpu: number;
  processMem: number;
  loadavg: number[];
}

// System details are updated every time
const info: ISystemInfo = {
  type: os.type(),
  hostname: os.hostname(),
  platform: os.platform(),
  release: os.release(),
  uptime: os.uptime(),
  cwd: process.cwd(),
  loadavg: os.loadavg(),
  freemem: 0,
  cpuUsage: 0,
  memUsage: 0,
  totalmem: 0,
  processCpu: 0,
  processMem: 0
};

let previousCpu = process.cpuUsage();
let previousTime = process.hrtime.bigint();

// periodically refresh the cache
function refresh() {
  const now = process.hrtime.bigint();
  const cpu = process.cpuUsage();
  const elapsed = Number(now - previousTime) / 1000;
  info.processCpu =
    elapsed > 0 ? (cpu.user - previousCpu.user + cpu.system - previousCpu.system) / elapsed : 0;
  previousCpu = cpu;
  previousTime = now;
  info.uptime = os.uptime();
  info.loadavg = os.loadavg();
  info.processMem = process.memoryUsage().rss;
  if (os.platform() === "linux") {
    return setLinuxSystemInfo();
  }
  return otherSystemInfo();
}

refresh();
setInterval(refresh, 3000).unref();

function otherSystemInfo() {
  info.freemem = os.freemem();
  info.totalmem = os.totalmem();
  info.memUsage = (os.totalmem() - os.freemem()) / os.totalmem();
  osUtils.cpuUsage((p) => (info.cpuUsage = p));
}

function setLinuxSystemInfo() {
  try {
    // read memory data based on /proc/meminfo
    const data = fs.readFileSync("/proc/meminfo", { encoding: "utf-8" });
    const list = data.split("\n");
    const infoTable: IInfoTable = {};
    list.forEach((line) => {
      const kv = line.split(":");
      if (kv.length === 2) {
        const k = kv[0].replace(/ /gim, "").replace(/\t/gim, "").trim().toLowerCase();
        let v = kv[1].replace(/ /gim, "").replace(/\t/gim, "").trim().toLowerCase();
        v = v.replace(/kb/gim, "").replace(/mb/gim, "").replace(/gb/gim, "");
        let vNumber = parseInt(v);
        if (isNaN(vNumber)) vNumber = 0;
        infoTable[k] = vNumber;
      }
    });
    const memAvailable = infoTable["memavailable"] ?? infoTable["memfree"];
    const memTotal = infoTable["memtotal"];
    info.freemem = memAvailable * 1024;
    info.totalmem = memTotal * 1024;
    info.memUsage = (info.totalmem - info.freemem) / info.totalmem;
    osUtils.cpuUsage((p) => (info.cpuUsage = p));
  } catch (error: any) {
    // If the reading is wrong, the default general reading method is automatically used
    otherSystemInfo();
  }
}

export function systemInfo() {
  return info;
}
