# npm 包

需要 Node.js 22.15 或更新版本。直接运行 `@elementspanel/init` 即可启动安装向导；也保留 `init-elementspanel` 命令。两个运行包为 `@elementspanel/panel` 和 `@elementspanel/daemon`：

```sh
npx @elementspanel/init@latest
```

向导首先询问语言，支持 English 和中文；后续问题、校验错误和完成提示使用所选语言，并为所选服务写入对应的语言配置。随后询问安装目录、安装 panel 与 daemon 两端或其中一端、所选服务的监听端口，以及是否立即安装依赖。中文系统默认选择中文，其他系统默认选择 English。默认目录为 `my-panel`，默认安装两端，panel 默认端口为 `23333`，daemon 默认端口为 `24444`。端口必须为 `1` 至 `65535` 的整数；安装两端时，两个端口不能相同。中文确认提示也支持输入“是”或“否”。

端口在安装依赖前写入所选服务的 `panel/data/SystemConfig/config.json` 和 `daemon/data/Config/global.json`，其他配置由服务首次启动时补齐。目标目录必须为空或不存在，也可以输入 `.` 使用当前空目录。完成后会输出 `cd` 和 `npm start` 命令；使用当前目录时省略 `cd`，选择暂不安装依赖时还会提示先运行 `npm install`。

自动化安装可以用 `--language en` 或 `--language zh` 指定语言，并通过参数跳过交互：

```sh
npx @elementspanel/init@latest my-panel --language zh --template full --panel-port 23333 --daemon-port 24444 --no-install --yes
```

内置插件按功能发布为 `@elementspanel/epanel-plugin-*`。例如，`epanel-plugin-instance` 包同时包含 panel 和 daemon 两端；`epanel-plugin-console` 只包含 panel 端。运行包在 `dependencies` 中固定对应插件版本，初始化器安装运行包时会自动安装这些依赖。

插件的标识、版本、名称、简介、作者、分类等元数据统一写在 `package.json`：npm 标准字段使用 `name`、`version`、`description`、`author`、`keywords` 等，展示名称使用 `displayName`，插件 ID 使用 `elementspanel.id`，双端标识使用 `elementspanel.dual`，分类使用 `elementspanel.category`。各端的 `plugin.json` 只定义执行入口（`backend`、`frontend` 等）。

源码插件在各自目录内的 `package.json.elementspanel` 中声明加载顺序 `priority`、前端依赖 `frontendInject`、启动标识 `frontendImmediate` / `frontendRequired`、兼容性 `elements` 和默认配置等。发布为 npm 包后，根 `package.json.elementspanel.id` 声明插件 ID，`elementspanel.panel` / `elementspanel.daemon` 声明各端的 `directory`、`folder` 与这些端专属元数据；生成的 CSS 路径记录在 `elementspanel.panel.styles`。双端插件可以在各端声明中保留各自的简介和展示名称，市场使用包级元数据。

插件市场和插件管理均通过 npm 安装、更新和卸载插件依赖。插件管理支持直接输入 `epanel-plugin-*` 包名（包括作用域包名）以及版本号或 tag，留空使用 `latest`，并可选择面板或守护节点。新装插件自动启用，更新保留原有启用状态；卸载保留用户配置。

安装记录写入依赖所属 `package.json` 的 `elementspanel.plugins`；用户启用状态和配置存放在各端的 `data/plugin-overrides.json`。外部执行 `npm install epanel-plugin-example` 新增的依赖也会被自动发现并启用；已有显式映射的插件沿用原有默认状态。插件包通过 peer dependencies 声明兼容的运行包版本。

运行期间会监测 npm 清单和锁文件，依赖变更稳定后卸载旧插件作用域、等待清理完成，再加载新版后端；浏览器同步更新前端资源和插件列表。`i18n`、`storage`、`runtime`、`server`、`console`、`config` 等核心插件不能在页面中卸载或替换；在命令行更新这些插件后仍需重启对应服务。源码插件不能通过 npm 管理入口卸载。

主程序从 npm 依赖中解析插件，支持依赖提升和嵌套安装。主程序包不复制内置插件目录；缺失的非核心插件会被跳过，核心插件缺失才会阻止启动。

核心源码位于 `core/panel/`、`core/daemon/`、`core/frontend/` 和 `core/common/`。内置插件按功能归档到 `plugins/<id>/`，每个插件只有一份根 `package.json`；`elementspanel.panel` 和 `elementspanel.daemon` 分别声明各端的目录、加载顺序与兼容性，端目录中的 `plugin.json` 只保留执行入口。单端插件只包含相应端的目录，双端插件共用包名与版本。

源码开发命令仍从项目根目录执行，依赖安装、类型检查和构建命令会进入 `core/` 中的对应目录。开发启动器将代码位置与工作目录分开：配置、日志、上传文件和节点工具继续使用根目录下的 `panel/`、`daemon/` 运行目录，无需迁移已有数据。源码目录重组不改变已发布 npm 包的目录布局、命令或用户数据位置。第三方插件工作区仍在初始化后的项目 `external/*` 中创建。

初始化后的项目可以这样创建和构建第三方插件：

```sh
npm run setup -- example
npm run build --workspace epanel-plugin-example
npm start
```

默认创建 panel 插件；使用 `npm run setup -- example --both` 创建双端插件。生成的 `external/example/package.json` 是全部元数据的统一来源，两端的 `plugin.json` 只保存入口；构建时更新入口与包内 CSS 路径，版本号始终读取根 `package.json.version`。构建后在插件配置中启用，发布使用 `npm run pub -- example`。

完整构建逻辑直接写在插件自身 `package.json.scripts.build` 中，构建工具声明在插件的 `devDependencies`，无需外置构建脚本。可在插件目录执行 `npm run build`，或在项目根目录使用上述 workspace 命令。`npm run build -- example` 仅转发到该插件的 npm 脚本；`prepack` 在发布前执行包内构建。

安装根目录与 `core/common`、`core/panel`、`core/daemon`、`core/frontend` 的依赖后，运行 `npm run build:npm` 生成 `npm-packages/`。daemon npm 包不携带平台二进制库；初始化项目首次启动 daemon 时，会将当前平台需要的工具下载到 `daemon/lib/`，与 `data/` 和 `logs/` 同级。已有编译结果时，`npm run package:npm` 只收集和校验产物；目标输出目录存在时会在新产物准备完成后静默替换，也可追加 `-- --out <新目录>`。

输出包含两个运行包、初始化器，以及每个内置插件的独立目录。版本分别沿用运行包和插件 `package.json` 中的版本号；一个插件的双端包名和版本必须一致。编译测试 workflow 会打包所有目录并保存 `.tgz` artifact，npm 发布由维护者手动执行。

发布前确认账号拥有包名及 `@elementspanel` scope 的权限，并使用尚未发布过的版本号。先发布所有插件包，再发布运行包和初始化器：

```sh
npm login
npm run publish:npm
```

`publish:npm` 只发布已有的 `npm-packages/`，不会构建项目；发布前先运行 `npm run package:npm` 收集最新编译产物。它会先检查包名和版本，按插件、运行包、初始化器的顺序发布。需要预览时运行 `npm run publish:npm -- --dry-run`。

发布中途失败后，运行 `npm run publish:npm -- --skip-existing` 可以跳过 registry 中已能查询到的同版本包，继续发布剩余包。追加 `--dry-run` 可预览剩余包，此时会查询 registry，但不会要求登录或上传。`--skip-existing` 不能与 `--skip-version-check` 同时使用；查询失败或发布出错时仍会停止。若 npm 提示版本已 staged，但 `npm view <包名>@<版本> version` 暂时查不到，需等待 npm 完成处理后再继续。

也可以下载 CI 的 artifact，按同样顺序发布其中的 `.tgz`。预发布使用预发布版本号，并在发布命令中添加 `--tag next`。非核心 npm 插件更新后动态生效，核心服务更新后重启对应服务；面板中的开关和配置写入用户目录。
