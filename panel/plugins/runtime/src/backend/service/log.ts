import fs from "fs-extra";
import { Logger } from "cordis";
import type { PanelPluginContext } from "../../../../../src/app/plugin";

export const logger = new Logger("runtime");
export default logger;

export function setupLogging(ctx: PanelPluginContext) {
  const time = new Date();
  const stamp = `${time.getFullYear()}-${
    time.getMonth() + 1
  }-${time.getDate()}_${time.getHours()}-${time.getMinutes()}-${time.getSeconds()}`;
  const appLevels: Logger.LevelConfig = { base: Logger.INFO };
  const files: Array<{ path: string; archive: string; levels: Logger.LevelConfig }> = [
    { path: "logs/current.log", archive: `logs/${stamp}.log`, levels: appLevels }
  ];

  ctx.effect(() => {
    const [stdout] = Logger.targets;
    const previousTime = stdout.showTime;
    const previousLevels = stdout.levels;
    const previousGlobalLevels = Logger.levels;
    stdout.showTime = "MM/dd hh:mm:ss";
    stdout.levels = appLevels;
    Logger.levels = appLevels;
    return () => {
      stdout.showTime = previousTime;
      stdout.levels = previousLevels;
      Logger.levels = previousGlobalLevels;
    };
  });

  for (const file of files) {
    ctx.effect(() => {
      if (fs.existsSync(file.path)) fs.renameSync(file.path, file.archive);
      fs.ensureFileSync(file.path);
      const fd = fs.openSync(file.path, "a");
      const target: Logger.Target = {
        colors: 0,
        showTime: "yyyy-MM-dd hh:mm:ss",
        levels: file.levels,
        print: (text) => fs.writeSync(fd, `${text}\n`)
      };
      Logger.targets.push(target);
      return () => {
        const index = Logger.targets.indexOf(target);
        if (index >= 0) Logger.targets.splice(index, 1);
        fs.closeSync(fd);
      };
    });
  }
}
