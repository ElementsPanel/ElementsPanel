const messages = {
  en: {
    languageInvalid: "--language must be en (English) or zh (中文).",
    portInvalid: "{side} port must be an integer between 1 and 65535.",
    templateInvalid: "--template must be full, panel or daemon.",
    optionUnknown: "Unknown option: {argument}",
    singleDirectory: "Specify only one project directory.",
    directoryInvalid: "The destination must be a regular directory.",
    directoryNotEmpty: "The destination is not empty: {directory}",
    portsConflict: "Panel and daemon ports must be different.",
    directoryPrompt: "Installation directory (my-panel): ",
    modePrompt: "Installation: 1) panel + daemon  2) panel only  3) daemon only (1): ",
    modeInvalid: "Choose 1, 2 or 3.",
    portPrompt: "{side} listening port ({port}): ",
    installPrompt: "Install dependencies now? (Y/n): ",
    confirmInvalid: "Answer yes or no.",
    modeTitle: "Installation mode",
    modeFull: "Panel + Daemon",
    modePanel: "Panel only",
    modeDaemon: "Daemon only",
    installTitle: "Install dependencies now?",
    installYes: "Yes, run npm install",
    installNo: "No, skip for now",
    selectHint: "↑/↓ to move · Enter to confirm",
    directoryTitle: "Installation directory",
    portTitle: "{side} listening port",
    modeUnknown: "Unknown installation mode: {mode}",
    versionLookupFailed:
      "Could not query the latest version of {name} from npm. Check your registry and network connection and try again.",
    installFailed:
      "npm install failed ({status}). The project is intact; run npm install in {directory} to retry.",
    created: "Panel initialized successfully in {directory}",
    nextSteps: "To start, run:",
    nodeVersion: "ElementsPanel requires Node.js 22.15 or newer.",
    help: "Usage: npx @elementspanel/init@latest [directory] [options]\n\nRun without options to choose the directory, services, ports and dependency installation interactively. The language follows the system locale.\n\n  --language <en|zh>    Use English or Chinese\n  --template <mode>     Install full, panel or daemon (default: full)\n  --panel-port <port>   Panel listening port (default: {panelPort})\n  --daemon-port <port>  Daemon listening port (default: {daemonPort})\n  --install            Install dependencies immediately\n  --no-install         Generate the project without installing dependencies\n  --yes, -y            Use defaults for unspecified options\n\nUse . as the directory to initialize the current empty folder.\n"
  },
  zh: {
    languageInvalid: "--language 必须为 en（English）或 zh（中文）。",
    portInvalid: "{side} 监听端口必须是 1 至 65535 之间的整数。",
    templateInvalid: "--template 必须为 full、panel 或 daemon。",
    optionUnknown: "未知参数：{argument}",
    singleDirectory: "只能指定一个安装目录。",
    directoryInvalid: "安装目标必须是普通目录，不能是文件或符号链接。",
    directoryNotEmpty: "安装目录非空：{directory}",
    portsConflict: "panel 和 daemon 的监听端口不能相同。",
    directoryPrompt: "安装目录（my-panel）： ",
    modePrompt: "安装内容：1) panel 和 daemon  2) 仅 panel  3) 仅 daemon（1）： ",
    modeInvalid: "请选择 1、2 或 3。",
    portPrompt: "{side} 监听端口（{port}）： ",
    installPrompt: "是否立即安装依赖？（Y/n，默认：是）： ",
    confirmInvalid: "请输入 yes 或 no，也可以输入“是”或“否”。",
    modeTitle: "安装内容",
    modeFull: "panel 和 daemon",
    modePanel: "仅 panel",
    modeDaemon: "仅 daemon",
    installTitle: "是否立即安装依赖？",
    installYes: "是，立即安装",
    installNo: "否，稍后手动安装",
    selectHint: "↑/↓ 移动 · 回车确认",
    directoryTitle: "安装目录",
    portTitle: "{side} 监听端口",
    modeUnknown: "未知安装模式：{mode}",
    versionLookupFailed: "无法从 npm 查询 {name} 的最新版本，请检查 registry 配置和网络连接后重试。",
    installFailed:
      "npm install 失败（{status}）。项目已保留，请进入 {directory} 后重新运行 npm install。",
    created: "已成功初始化面板：{directory}",
    nextSteps: "如需启动，请执行：",
    nodeVersion: "ElementsPanel 需要 Node.js 22.15 或更新版本。",
    help: "用法：npx @elementspanel/init@latest [目录] [参数]\n\n不指定参数时，通过向导选择安装目录、服务、监听端口和是否立即安装依赖，语言跟随系统环境。\n\n  --language <en|zh>    使用 English 或中文\n  --template <模式>    安装 full、panel 或 daemon（默认：full）\n  --panel-port <端口>  panel 监听端口（默认：{panelPort}）\n  --daemon-port <端口> daemon 监听端口（默认：{daemonPort}）\n  --install            立即安装依赖\n  --no-install         仅生成项目，不安装依赖\n  --yes, -y            未指定的选项使用默认值\n\n目录输入 . 可在当前空目录中初始化。\n"
  }
};

function normalizeLanguage(value) {
  if (typeof value !== "string") return undefined;
  const language = value.trim().toLowerCase().replace(/_/g, "-");
  if (["1", "en", "eng", "english", "en-us"].includes(language)) return "en";
  if (["2", "zh", "中文", "chinese", "zh-cn"].includes(language)) return "zh";
  return undefined;
}

function createTranslator(language = "en") {
  const catalog = Object.hasOwn(messages, language) ? messages[language] : messages.en;
  return (key, values = {}) => {
    const message = catalog[key];
    if (typeof message !== "string") throw new Error(`Unknown initializer message: ${key}`);
    return message.replace(/\{(\w+)\}/g, (placeholder, name) =>
      Object.hasOwn(values, name) ? String(values[name]) : placeholder
    );
  };
}

module.exports = { createTranslator, normalizeLanguage };
