import fs from "fs-extra";
import { Logger } from "cordis";

// Logging is cordis's, so that a plugin's `ctx.logger` and the panel's own
// output share one pipeline: `Logger.targets` below is global, and
// `@cordisjs/logger` builds every per-plugin logger on top of it.

const LOG_FILE_PATH = "logs/current.log";

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

const GLOBAL_LOGGER_KEY = "__elementsPanelLogger";
const shared = (globalThis as typeof globalThis & { [GLOBAL_LOGGER_KEY]?: Logger })[
  GLOBAL_LOGGER_KEY
];

/** The panel core's logger. Plugins use `ctx.logger`, which names itself. */
export const logger = shared ?? (() => {
  // Save the log file separately on each process startup. This guard keeps a
  // plugin bundle from configuring a second file target when it imports a core
  // helper that happens to reference this module.
  if (fs.existsSync(LOG_FILE_PATH)) {
    const time = new Date();
    const timeString = `${time.getFullYear()}-${
      time.getMonth() + 1
    }-${time.getDate()}_${time.getHours()}-${time.getMinutes()}-${time.getSeconds()}`;
    fs.renameSync(LOG_FILE_PATH, `logs/${timeString}.log`);
  }
  const [stdout] = Logger.targets;
  stdout.showTime = "MM/dd hh:mm:ss";
  stdout.levels = APP_LEVELS;
  Logger.targets.push(createFileTarget(LOG_FILE_PATH, APP_LEVELS));
  Logger.levels = APP_LEVELS;
  const value = new Logger("app");
  (globalThis as typeof globalThis & { [GLOBAL_LOGGER_KEY]?: Logger })[
    GLOBAL_LOGGER_KEY
  ] = value;
  return value;
})();
