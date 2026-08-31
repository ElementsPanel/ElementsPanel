import fs from "fs-extra";
import { Logger } from "cordis";

// Logging is cordis's, so that a plugin's `ctx.logger` and the panel's own
// output share one pipeline: `Logger.targets` below is global, and
// `@cordisjs/logger` builds every per-plugin logger on top of it.

const LOG_FILE_PATH = "logs/current.log";

// save the log file separately on each startup
if (fs.existsSync(LOG_FILE_PATH)) {
  const time = new Date();
  const timeString = `${time.getFullYear()}-${
    time.getMonth() + 1
  }-${time.getDate()}_${time.getHours()}-${time.getMinutes()}-${time.getSeconds()}`;
  fs.renameSync(LOG_FILE_PATH, `logs/${timeString}.log`);
}

/**
 * Appends through a single file descriptor kept open for the process lifetime.
 * Writes are synchronous on purpose: the panel calls `process.exit()` directly
 * when it shuts down, which would drop anything still buffered in a stream.
 */
function createFileTarget(filePath: string, levels: Logger.LevelConfig): Logger.Target {
  fs.ensureFileSync(filePath);
  const fd = fs.openSync(filePath, "a");
  return {
    colors: 0,
    showTime: "yyyy-MM-dd hh:mm:ss",
    levels,
    print: (text) => fs.writeSync(fd, `${text}\n`)
  };
}

const APP_LEVELS: Logger.LevelConfig = { base: Logger.INFO };

// The first target is reggol's own, which prints to stdout with the colour
// support it detected. Only its timestamp is ours.
const [stdout] = Logger.targets;
stdout.showTime = "MM/dd hh:mm:ss";
stdout.levels = APP_LEVELS;
Logger.targets.push(createFileTarget(LOG_FILE_PATH, APP_LEVELS));
Logger.levels = APP_LEVELS;

/** The panel core's logger. Plugins use `ctx.logger`, which names itself. */
export const logger = new Logger("app");
