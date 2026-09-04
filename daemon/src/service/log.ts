import fs from "fs-extra";
import { Logger } from "cordis";

// Logging is cordis's, so that a plugin's `ctx.logger` and the daemon's own
// output share one pipeline: `Logger.targets` below is global, and
// `@cordisjs/logger` builds every per-plugin logger on top of it.

const LOG_FILE_PATH = "logs/current.log";
const LOG_SYS_INFO_FILE_PATH = "logs/sysinfo.log";
const SYS_INFO_LOGGER_NAME = "sysinfo";

/**
 * Appends through a single file descriptor kept open for the process lifetime.
 * Writes are synchronous on purpose: the daemon calls `process.exit()` directly
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

// The periodic host report is voluminous and belongs in its own file only, so
// the two application targets silence it and its target silences everything else.
const APP_LEVELS: Logger.LevelConfig = { base: Logger.INFO, [SYS_INFO_LOGGER_NAME]: Logger.SILENT };
const SYS_INFO_LEVELS: Logger.LevelConfig = {
  base: Logger.SILENT,
  [SYS_INFO_LOGGER_NAME]: Logger.INFO
};

const GLOBAL_LOGGER_KEY = "__elementsDaemonLogger";
const shared = (globalThis as typeof globalThis & { [GLOBAL_LOGGER_KEY]?: Logger })[
  GLOBAL_LOGGER_KEY
];

/** The daemon core's logger. Plugins use `ctx.logger`, which names itself. */
const logger = shared ?? (() => {
  const time = new Date();
  const timeString =
    `${time.getFullYear()}-${time.getMonth() + 1}-${time.getDate()}` +
    `_${time.getHours()}-${time.getMinutes()}-${time.getSeconds()}`;
  if (fs.existsSync(LOG_FILE_PATH)) fs.renameSync(LOG_FILE_PATH, `logs/${timeString}.log`);
  if (fs.existsSync(LOG_SYS_INFO_FILE_PATH)) {
    fs.renameSync(LOG_SYS_INFO_FILE_PATH, `logs/sysinfo_${timeString}.log`);
  }
  const [stdout] = Logger.targets;
  stdout.showTime = "MM/dd hh:mm:ss";
  stdout.levels = APP_LEVELS;
  Logger.targets.push(
    createFileTarget(LOG_FILE_PATH, APP_LEVELS),
    createFileTarget(LOG_SYS_INFO_FILE_PATH, SYS_INFO_LEVELS)
  );
  Logger.levels = APP_LEVELS;
  const value = new Logger("app");
  (globalThis as typeof globalThis & { [GLOBAL_LOGGER_KEY]?: Logger })[
    GLOBAL_LOGGER_KEY
  ] = value;
  return value;
})();

export default logger;
