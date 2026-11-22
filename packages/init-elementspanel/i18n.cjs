const messages = {
  en: {
    TXT_CODE_INIT_WORKSPACE_NAME_TITLE: "Name",
    TXT_CODE_INIT_WORKSPACE_TYPE_TITLE: "Type",
    TXT_CODE_INIT_WORKSPACE_TYPE_INVALID: "Choose panel, daemon or both.",
    TXT_CODE_INIT_WORKSPACE_NAME_REQUIRED: "Enter a name.",
    TXT_CODE_INIT_WORKSPACE_SCOPE_INVALID: "Use @scope/name.",
    TXT_CODE_INIT_WORKSPACE_NAME_INVALID: "Invalid name: {name}",
    TXT_CODE_INIT_WORKSPACE_SINGLE_NAME: "Specify only one name.",
    TXT_CODE_INIT_WORKSPACE_EXISTS: "Workspace already exists: {directory}",
    TXT_CODE_INIT_WORKSPACE_CREATED: "Workspace created: {directory}",
    TXT_CODE_INIT_WORKSPACE_HELP:
      "Usage: epanel-workspace <command> [options]\n\n  install [--ignore-scripts]\n  setup [name] [--panel|--daemon|--both]\n  build [name ...]\n  publish [name ...]\n\nRun npm run setup to choose a name and type.\n\nSetup options:\n  --language <en|zh>  Language (default: system)\n  --yes, -y          Skip prompts (name required; default: panel)\n  --no-install       Skip dependency installation\n",
    TXT_CODE_INIT_LANGUAGE_INVALID: "--language must be en or zh.",
    TXT_CODE_INIT_PORT_INVALID: "{side} listening port must be an integer between 1 and 65535.",
    TXT_CODE_INIT_TEMPLATE_INVALID: "--template must be full, panel or daemon.",
    TXT_CODE_INIT_OPTION_UNKNOWN: "Unknown option: {argument}",
    TXT_CODE_INIT_SINGLE_DIRECTORY: "Specify only one installation directory.",
    TXT_CODE_INIT_DIRECTORY_INVALID: "The installation target must be a regular directory.",
    TXT_CODE_INIT_DIRECTORY_NOT_EMPTY: "Installation directory is not empty: {directory}",
    TXT_CODE_INIT_PORTS_CONFLICT: "panel and daemon ports must be different.",
    TXT_CODE_INIT_DIRECTORY_PROMPT: "Installation directory (my-panel): ",
    TXT_CODE_INIT_MODE_PROMPT: "Installation mode: 1) panel + daemon  2) panel  3) daemon (1): ",
    TXT_CODE_INIT_MODE_INVALID: "Choose 1, 2 or 3.",
    TXT_CODE_INIT_PORT_PROMPT: "{side} listening port ({port}): ",
    TXT_CODE_INIT_INSTALL_PROMPT: "Install dependencies? (Y/n): ",
    TXT_CODE_INIT_CONFIRM_INVALID: "Enter yes or no.",
    TXT_CODE_INIT_MODE_TITLE: "Installation mode",
    TXT_CODE_INIT_MODE_FULL: "panel + daemon",
    TXT_CODE_INIT_MODE_PANEL: "panel",
    TXT_CODE_INIT_MODE_DAEMON: "daemon",
    TXT_CODE_INIT_INSTALL_TITLE: "Install dependencies?",
    TXT_CODE_INIT_INSTALL_YES: "Yes",
    TXT_CODE_INIT_INSTALL_NO: "No",
    TXT_CODE_INIT_SELECT_HINT: "↑/↓ to move · Enter to confirm",
    TXT_CODE_INIT_DIRECTORY_TITLE: "Installation directory",
    TXT_CODE_INIT_PORT_TITLE: "{side} listening port",
    TXT_CODE_INIT_MODE_UNKNOWN: "Unknown installation mode: {mode}",
    TXT_CODE_INIT_VERSION_LOOKUP_LOADING: "Fetching versions...",
    TXT_CODE_INIT_VERSION_LOOKUP_FAILED:
      "Could not query the npm version for {name}. Check the registry and network.",
    TXT_CODE_INIT_PLUGIN_ASSETS_MISMATCH:
      "Incompatible panel assets for {name}. Update the panel or use a compatible plugin version.",
    TXT_CODE_INIT_PLUGIN_CATALOGUE_MISSING: "Missing {side} plugin catalogue.",
    TXT_CODE_INIT_PLUGIN_CATALOGUE_INVALID: "Invalid {side} plugin catalogue.",
    TXT_CODE_INIT_PLUGIN_METADATA_INVALID: "Invalid {side} metadata: {name}",
    TXT_CODE_INIT_RUNTIME_NOT_FOUND: "No selected services in this project.",
    TXT_CODE_INIT_UPDATED: "Plugin versions updated: {directory}",
    TXT_CODE_INIT_INSTALL_FAILED:
      "npm install failed ({status}). Run npm install in {directory} to retry.",
    TXT_CODE_INIT_CREATED: "Project initialized: {directory}",
    TXT_CODE_INIT_NEXT_STEPS: "To start, run:",
    TXT_CODE_INIT_NODE_VERSION: "Requires Node.js 22.15 or newer.",
    TXT_CODE_INIT_HELP:
      "Usage: npx @elementspanel/init@latest [directory] [options]\n\nRun without options to use the installation wizard. Use . as the installation directory for the current empty folder.\n\n  --language <en|zh>              Use English or Chinese\n  --template <full|panel|daemon>  Installation mode (default: full)\n  --panel-port <port>            panel listening port (default: {panelPort})\n  --daemon-port <port>           daemon listening port (default: {daemonPort})\n  --install                     Install dependencies now\n  --no-install                  Generate the project without installing dependencies\n  --update-plugins              Update built-in plugin versions\n  --yes, -y                     Skip prompts; use defaults for omitted options\n"
  },
  zh: {
    TXT_CODE_INIT_WORKSPACE_NAME_TITLE: "名称",
    TXT_CODE_INIT_WORKSPACE_TYPE_TITLE: "类型",
    TXT_CODE_INIT_WORKSPACE_TYPE_INVALID: "请选择 panel、daemon 或双端。",
    TXT_CODE_INIT_WORKSPACE_NAME_REQUIRED: "请输入名称。",
    TXT_CODE_INIT_WORKSPACE_SCOPE_INVALID: "名称格式：@scope/name。",
    TXT_CODE_INIT_WORKSPACE_NAME_INVALID: "名称无效：{name}",
    TXT_CODE_INIT_WORKSPACE_SINGLE_NAME: "只能指定一个名称。",
    TXT_CODE_INIT_WORKSPACE_EXISTS: "工作区已存在：{directory}",
    TXT_CODE_INIT_WORKSPACE_CREATED: "已创建工作区：{directory}",
    TXT_CODE_INIT_WORKSPACE_HELP:
      "用法：epanel-workspace <命令> [参数]\n\n  install [--ignore-scripts]\n  setup [名称] [--panel|--daemon|--both]\n  build [名称 ...]\n  publish [名称 ...]\n\n运行 npm run setup，交互选择名称和类型。\n\nsetup 参数：\n  --language <en|zh>  语言（默认跟随系统）\n  --yes, -y          跳过交互（名称必填，默认 panel）\n  --no-install       跳过依赖安装\n",
    TXT_CODE_INIT_LANGUAGE_INVALID: "--language 必须为 en 或 zh。",
    TXT_CODE_INIT_PORT_INVALID: "{side} 监听端口必须为 1–65535 的整数。",
    TXT_CODE_INIT_TEMPLATE_INVALID: "--template 必须为 full、panel 或 daemon。",
    TXT_CODE_INIT_OPTION_UNKNOWN: "未知参数：{argument}",
    TXT_CODE_INIT_SINGLE_DIRECTORY: "只能指定一个安装目录。",
    TXT_CODE_INIT_DIRECTORY_INVALID: "安装目录不能是文件或符号链接。",
    TXT_CODE_INIT_DIRECTORY_NOT_EMPTY: "安装目录非空：{directory}",
    TXT_CODE_INIT_PORTS_CONFLICT: "panel 和 daemon 端口不能相同。",
    TXT_CODE_INIT_DIRECTORY_PROMPT: "安装目录（my-panel）： ",
    TXT_CODE_INIT_MODE_PROMPT: "安装内容：1) panel + daemon  2) panel  3) daemon（1）： ",
    TXT_CODE_INIT_MODE_INVALID: "请选择 1、2 或 3。",
    TXT_CODE_INIT_PORT_PROMPT: "{side} 监听端口（{port}）： ",
    TXT_CODE_INIT_INSTALL_PROMPT: "是否安装依赖？（Y/n）： ",
    TXT_CODE_INIT_CONFIRM_INVALID: "请输入是或否。",
    TXT_CODE_INIT_MODE_TITLE: "安装内容",
    TXT_CODE_INIT_MODE_FULL: "panel + daemon",
    TXT_CODE_INIT_MODE_PANEL: "panel",
    TXT_CODE_INIT_MODE_DAEMON: "daemon",
    TXT_CODE_INIT_INSTALL_TITLE: "是否安装依赖？",
    TXT_CODE_INIT_INSTALL_YES: "是",
    TXT_CODE_INIT_INSTALL_NO: "否",
    TXT_CODE_INIT_SELECT_HINT: "↑/↓ 移动 · 回车确认",
    TXT_CODE_INIT_DIRECTORY_TITLE: "安装目录",
    TXT_CODE_INIT_PORT_TITLE: "{side} 监听端口",
    TXT_CODE_INIT_MODE_UNKNOWN: "未知安装模式：{mode}",
    TXT_CODE_INIT_VERSION_LOOKUP_LOADING: "正在获取版本...",
    TXT_CODE_INIT_VERSION_LOOKUP_FAILED: "无法获取 {name} 的 npm 版本，请检查 registry 和网络。",
    TXT_CODE_INIT_PLUGIN_ASSETS_MISMATCH: "{name} 与面板资源不兼容，请更新面板或使用兼容版本。",
    TXT_CODE_INIT_PLUGIN_CATALOGUE_MISSING: "{side} 缺少插件清单。",
    TXT_CODE_INIT_PLUGIN_CATALOGUE_INVALID: "{side} 插件清单无效。",
    TXT_CODE_INIT_PLUGIN_METADATA_INVALID: "{side} 元数据无效：{name}",
    TXT_CODE_INIT_RUNTIME_NOT_FOUND: "项目中未找到所选服务。",
    TXT_CODE_INIT_UPDATED: "已更新插件版本：{directory}",
    TXT_CODE_INIT_INSTALL_FAILED:
      "npm install 失败（{status}）。请在 {directory} 中重新运行 npm install。",
    TXT_CODE_INIT_CREATED: "已初始化项目：{directory}",
    TXT_CODE_INIT_NEXT_STEPS: "启动命令：",
    TXT_CODE_INIT_NODE_VERSION: "需要 Node.js 22.15 或更新版本。",
    TXT_CODE_INIT_HELP:
      "用法：npx @elementspanel/init@latest [安装目录] [参数]\n\n不带参数进入安装向导，安装目录可使用 .（当前空目录）。\n\n  --language <en|zh>              使用 English 或中文\n  --template <full|panel|daemon>  安装内容（默认 full）\n  --panel-port <端口>            panel 监听端口（默认 {panelPort}）\n  --daemon-port <端口>           daemon 监听端口（默认 {daemonPort}）\n  --install                     立即安装依赖\n  --no-install                  仅生成项目，不安装依赖\n  --update-plugins              更新内置插件版本\n  --yes, -y                     跳过向导，使用未指定项的默认值\n"
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
