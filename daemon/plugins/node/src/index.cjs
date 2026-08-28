// Daemon side of the node plugin. It owns "info/setting", the protocol event
// the panel node plugin uses to write this node's configuration. The daemon
// core only reports its configuration through "info/overview".

// Inlined from mcsmanager-common, which is bundled into the daemon at build
// time and therefore not requirable from a runtime plugin.
function isEmpty(value) {
  return value === null || value === undefined;
}

function toText(value) {
  if (isEmpty(value)) return null;
  return String(value);
}

function toNumber(value) {
  if (isEmpty(value)) return null;
  if (isNaN(Number(value))) return null;
  return Number(value);
}

function toBoolean(value) {
  if (isEmpty(value)) return null;
  return Boolean(value);
}

const BACKUP_FORMATS = ["zip", "tar.gz", "7z"];

module.exports.setup = function setupNodeDaemonPlugin(context) {
  context.registerProtocolHandler("info/setting", async (ctx, data) => {
    const config = context.config;
    const payload = data || {};

    const language = toText(payload.language);
    const uploadSpeedRate = toNumber(payload.uploadSpeedRate);
    const downloadSpeedRate = toNumber(payload.downloadSpeedRate);
    const maxDownloadFromUrlFileCount = toNumber(payload.maxDownloadFromUrlFileCount);
    const portRangeStart = toNumber(payload.portRangeStart);
    const portRangeEnd = toNumber(payload.portRangeEnd);
    const portAssignInterval = toNumber(payload.portAssignInterval);
    const port = toNumber(payload.port);
    const outputBufferSize = toNumber(payload.outputBufferSize);
    const enableSoftShutdown = toBoolean(payload.enableSoftShutdown);
    const softShutdownSkipDocker = toBoolean(payload.softShutdownSkipDocker);
    const softShutdownWaitSeconds = toNumber(payload.softShutdownWaitSeconds);
    const instanceBackupPath = toText(payload.instanceBackupPath);
    const instanceBackupFormat = toText(payload.instanceBackupFormat);
    const instanceBackupCompressionLevel = toNumber(payload.instanceBackupCompressionLevel);

    if (language) {
      context.setLanguage(language);
    }
    if (uploadSpeedRate != null && uploadSpeedRate >= 0) {
      config.uploadSpeedRate = uploadSpeedRate;
    }
    if (downloadSpeedRate != null && downloadSpeedRate >= 0) {
      config.downloadSpeedRate = downloadSpeedRate;
    }
    if (maxDownloadFromUrlFileCount != null && maxDownloadFromUrlFileCount >= 0) {
      config.maxDownloadFromUrlFileCount = maxDownloadFromUrlFileCount;
    }
    if (portRangeStart != null && portRangeEnd != null && portRangeStart < portRangeEnd) {
      config.allocatablePortRange = [portRangeStart, portRangeEnd];
      config.currentAllocatablePort = portRangeStart;
    }
    if (portAssignInterval != null && portAssignInterval > 0) {
      config.portAssignInterval = portAssignInterval;
    }
    if (port && port > 0 && port < 65535) {
      config.port = port;
    }
    if (outputBufferSize != null && outputBufferSize >= 16 && outputBufferSize <= 4096) {
      config.outputBufferSize = outputBufferSize;
    }
    if (enableSoftShutdown != null) {
      config.enableSoftShutdown = enableSoftShutdown;
    }
    if (softShutdownSkipDocker != null) {
      config.softShutdownSkipDocker = softShutdownSkipDocker;
    }
    if (
      softShutdownWaitSeconds != null &&
      softShutdownWaitSeconds >= 1 &&
      softShutdownWaitSeconds <= 600
    ) {
      config.softShutdownWaitSeconds = softShutdownWaitSeconds;
    }
    if (instanceBackupPath != null) {
      config.instanceBackupPath = instanceBackupPath;
    }
    if (BACKUP_FORMATS.includes(instanceBackupFormat)) {
      config.instanceBackupFormat = instanceBackupFormat;
    }
    if (
      instanceBackupCompressionLevel != null &&
      Number.isInteger(instanceBackupCompressionLevel) &&
      instanceBackupCompressionLevel >= 0 &&
      instanceBackupCompressionLevel <= 9
    ) {
      config.instanceBackupCompressionLevel = instanceBackupCompressionLevel;
    }

    context.saveConfig();
    context.protocol.response(ctx, true);
  });
};
