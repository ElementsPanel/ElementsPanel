const messages = {
  en: {
    TXT_CODE_INIT_LANGUAGE_INVALID: "--language must be en (English) or zh (中文).",
    TXT_CODE_INIT_PORT_INVALID: "{side} port must be an integer between 1 and 65535.",
    TXT_CODE_INIT_TEMPLATE_INVALID: "--template must be full, panel or daemon.",
    TXT_CODE_INIT_OPTION_UNKNOWN: "Unknown option: {argument}",
    TXT_CODE_INIT_SINGLE_DIRECTORY: "Specify only one project directory.",
    TXT_CODE_INIT_DIRECTORY_INVALID: "The destination must be a regular directory.",
    TXT_CODE_INIT_DIRECTORY_NOT_EMPTY: "The destination is not empty: {directory}",
    TXT_CODE_INIT_PORTS_CONFLICT: "Panel and daemon ports must be different.",
    TXT_CODE_INIT_DIRECTORY_PROMPT: "Installation directory (my-panel): ",
    TXT_CODE_INIT_MODE_PROMPT:
      "Installation: 1) panel + daemon  2) panel only  3) daemon only (1): ",
    TXT_CODE_INIT_MODE_INVALID: "Choose 1, 2 or 3.",
    TXT_CODE_INIT_PORT_PROMPT: "{side} listening port ({port}): ",
    TXT_CODE_INIT_INSTALL_PROMPT: "Install dependencies now? (Y/n): ",
    TXT_CODE_INIT_CONFIRM_INVALID: "Answer yes or no.",
    TXT_CODE_INIT_MODE_TITLE: "Installation mode",
    TXT_CODE_INIT_MODE_FULL: "Panel + Daemon",
    TXT_CODE_INIT_MODE_PANEL: "Panel only",
    TXT_CODE_INIT_MODE_DAEMON: "Daemon only",
    TXT_CODE_INIT_INSTALL_TITLE: "Install dependencies now?",
    TXT_CODE_INIT_INSTALL_YES: "Yes, run npm install",
    TXT_CODE_INIT_INSTALL_NO: "No, skip for now",
    TXT_CODE_INIT_SELECT_HINT: "↑/↓ to move · Enter to confirm",
    TXT_CODE_INIT_DIRECTORY_TITLE: "Installation directory",
    TXT_CODE_INIT_PORT_TITLE: "{side} listening port",
    TXT_CODE_INIT_MODE_UNKNOWN: "Unknown installation mode: {mode}",
    TXT_CODE_INIT_VERSION_LOOKUP_LOADING: "Fetching version numbers...",
    TXT_CODE_INIT_VERSION_LOOKUP_FAILED:
      "Could not query the latest version of {name} from npm. Check your registry and network connection and try again.",
    TXT_CODE_INIT_PLUGIN_ASSETS_MISMATCH:
      "The latest {name} requires frontend modules or legacy assets unavailable in this panel. Update the panel or install a compatible plugin version.",
    TXT_CODE_INIT_UPDATED: "Built-in plugin versions updated in {directory}",
    TXT_CODE_INIT_INSTALL_FAILED:
      "npm install failed ({status}). The project is intact; run npm install in {directory} to retry.",
    TXT_CODE_INIT_CREATED: "Panel initialized successfully in {directory}",
    TXT_CODE_INIT_NEXT_STEPS: "To start, run:",
    TXT_CODE_INIT_NODE_VERSION: "ElementsPanel requires Node.js 22.15 or newer.",
    TXT_CODE_INIT_HELP:
      "Usage: npx @elementspanel/init@latest [directory] [options]\n\nRun without options to choose the directory, services, ports and dependency installation interactively. The language follows the system locale.\n\n  --language <en|zh>    Use English or Chinese\n  --template <mode>     Install full, panel or daemon (default: full)\n  --panel-port <port>   Panel listening port (default: {panelPort})\n  --daemon-port <port>  Daemon listening port (default: {daemonPort})\n  --install            Install dependencies immediately\n  --update-plugins     Refresh built-in versions in an existing project\n  --no-install         Generate the project without installing dependencies\n  --yes, -y            Use defaults for unspecified options\n\nUse . as the directory to initialize the current empty folder.\n"
  },
  zh: {
    TXT_CODE_INIT_LANGUAGE_INVALID: "--language 必须为 en（English）或 zh（中文）。",
    TXT_CODE_INIT_PORT_INVALID: "{side} 监听端口必须是 1 至 65535 之间的整数。",
    TXT_CODE_INIT_TEMPLATE_INVALID: "--template 必须为 full、panel 或 daemon。",
    TXT_CODE_INIT_OPTION_UNKNOWN: "未知参数：{argument}",
    TXT_CODE_INIT_SINGLE_DIRECTORY: "只能指定一个安装目录。",
    TXT_CODE_INIT_DIRECTORY_INVALID: "安装目标必须是普通目录，不能是文件或符号链接。",
    TXT_CODE_INIT_DIRECTORY_NOT_EMPTY: "安装目录非空：{directory}",
    TXT_CODE_INIT_PORTS_CONFLICT: "panel 和 daemon 的监听端口不能相同。",
    TXT_CODE_INIT_DIRECTORY_PROMPT: "安装目录（my-panel）： ",
    TXT_CODE_INIT_MODE_PROMPT: "安装内容：1) panel 和 daemon  2) 仅 panel  3) 仅 daemon（1）： ",
    TXT_CODE_INIT_MODE_INVALID: "请选择 1、2 或 3。",
    TXT_CODE_INIT_PORT_PROMPT: "{side} 监听端口（{port}）： ",
    TXT_CODE_INIT_INSTALL_PROMPT: "是否立即安装依赖？（Y/n，默认：是）： ",
    TXT_CODE_INIT_CONFIRM_INVALID: "请输入 yes 或 no，也可以输入“是”或“否”。",
    TXT_CODE_INIT_MODE_TITLE: "安装内容",
    TXT_CODE_INIT_MODE_FULL: "panel 和 daemon",
    TXT_CODE_INIT_MODE_PANEL: "仅 panel",
    TXT_CODE_INIT_MODE_DAEMON: "仅 daemon",
    TXT_CODE_INIT_INSTALL_TITLE: "是否立即安装依赖？",
    TXT_CODE_INIT_INSTALL_YES: "是，立即安装",
    TXT_CODE_INIT_INSTALL_NO: "否，稍后手动安装",
    TXT_CODE_INIT_SELECT_HINT: "↑/↓ 移动 · 回车确认",
    TXT_CODE_INIT_DIRECTORY_TITLE: "安装目录",
    TXT_CODE_INIT_PORT_TITLE: "{side} 监听端口",
    TXT_CODE_INIT_MODE_UNKNOWN: "未知安装模式：{mode}",
    TXT_CODE_INIT_VERSION_LOOKUP_LOADING: "正在获取版本号...",
    TXT_CODE_INIT_VERSION_LOOKUP_FAILED:
      "无法从 npm 查询 {name} 的最新版本，请检查 registry 配置和网络连接后重试。",
    TXT_CODE_INIT_PLUGIN_ASSETS_MISMATCH:
      "最新版 {name} 所需的前端模块接口或旧版资源在当前面板中不可用，请更新面板或安装兼容的插件版本。",
    TXT_CODE_INIT_UPDATED: "已更新 {directory} 中的内置插件版本",
    TXT_CODE_INIT_INSTALL_FAILED:
      "npm install 失败（{status}）。项目已保留，请进入 {directory} 后重新运行 npm install。",
    TXT_CODE_INIT_CREATED: "已成功初始化面板：{directory}",
    TXT_CODE_INIT_NEXT_STEPS: "如需启动，请执行：",
    TXT_CODE_INIT_NODE_VERSION: "ElementsPanel 需要 Node.js 22.15 或更新版本。",
    TXT_CODE_INIT_HELP:
      "用法：npx @elementspanel/init@latest [目录] [参数]\n\n不指定参数时，通过向导选择安装目录、服务、监听端口和是否立即安装依赖，语言跟随系统环境。\n\n  --language <en|zh>    使用 English 或中文\n  --template <模式>    安装 full、panel 或 daemon（默认：full）\n  --panel-port <端口>  panel 监听端口（默认：{panelPort}）\n  --daemon-port <端口> daemon 监听端口（默认：{daemonPort}）\n  --install            立即安装依赖\n  --update-plugins     更新已有项目中的内置插件版本\n  --no-install         仅生成项目，不安装依赖\n  --yes, -y            未指定的选项使用默认值\n\n目录输入 . 可在当前空目录中初始化。\n"
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

module.exports = { createTranslator, normalizeLanguage, localeMessages: messages };
