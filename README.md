<div align="center">

<img src="logo-w.svg#gh-dark-mode-only" width="45%">
<img src="logo-b.svg#gh-light-mode-only" width="45%">

# ElementsPanel

一款基于 [MCSManager](https://www.mcsmanager.com) 和 [Cordis](https://github.com/cordiverse/cordis) 的游戏面板

</div>

## npm 安装

需要 Node.js **22.15 或更新版本**。以下命令在 `create-elementspanel`、`@elementspanel/panel` 和 `@elementspanel/daemon` 发布到 npm 后可用：

```sh
npm init elementspanel@latest my-panel
cd my-panel
npm start
```

初始化时可选择完整安装、仅面板或仅节点。完整安装的 `npm start` 会先启动本地 daemon，等待节点就绪后启动 panel，并自动连接。面板默认地址为 `http://localhost:23333`，节点默认端口为 `24444`。按 Ctrl+C 会正常关闭服务并执行实例关闭流程。

在当前空目录初始化，或跳过交互：

```sh
npm init elementspanel@latest . -- --template full --yes
```

`--template` 支持 `full`、`panel`、`daemon`。初始化器自动安装依赖；如果使用 `--no-install`，或安装因网络问题失败，在生成的目录中执行 `npm install` 后再执行 `npm start`。

程序和内置资源位于 `node_modules`，用户数据位于项目的 `panel/` 和 `daemon/`。市场插件写入各端的 `data/plugins/`，内置插件通过配置启停；面板上传图片仍保存在 `panel/public/upload_files/`。Java、Docker 和游戏运行环境需按实例需求另行安装。

也可以在自己的 npm 项目中安装运行包，通过 `epanel start` 或 `epanel-daemon start` 启动。`epanel start --with-daemon` 要求项目同时安装 daemon 包。`--cwd` 指定项目目录，`--panel-dir`、`--daemon-dir` 指定各端运行目录。例如复用旧发行版的数据位置：

```sh
npx epanel start --with-daemon --panel-dir /opt/elementspanel/web --daemon-dir /opt/elementspanel/daemon
```

迁移前停止旧进程并备份两端目录。保持实例配置中的绝对路径可访问；如果移动了目录，需要检查实例路径、证书路径及工具配置。旧的 `plugins/`、`market_plugins/` 仍可被读取，包内同名内置插件优先。升级前备份数据，安装兼容的双端版本后重新启动；保留 `package-lock.json` 以复现依赖版本。

## npm 发布

发布 GitHub Release 后，`npm-publish.yml` 会自动检出该 Release 的 tag，安装锁定的依赖、运行测试和类型检查、构建并发布三个 npm 包，顺序为 daemon、panel、初始化器。正式 Release 发布到 `latest`，勾选预发布的 Release 发布到 `next`；仅推送 Git tag 不会触发发布。也可在 Actions 中手动运行，指定 tag/commit 和 npm 标签。

首次发布前需要配置：

1. 确保 npm 账号可使用 `create-elementspanel` 包名及 `@elementspanel` scope。
2. 在 GitHub 的 `npm` environment 或仓库 Actions secrets 中设置有发布权限的 `NPM_TOKEN`，用于创建并首次发布这三个包。
3. 包创建后，可为三个包分别配置 npm Trusted Publishing：GitHub owner 为 `ElementsPanel`，repository 为 `ElementsPanel`，workflow 为 `npm-publish.yml`，environment 为 `npm`。配置完成后移除 `NPM_TOKEN`，后续发布使用 OIDC。工作流使用 Node.js 24，并附带 provenance。

发布版本分别来自 `daemon/package.json`、`panel/package.json` 和 `packages/create-elementspanel/package.json`，工作流不会根据 tag 自动改写版本。发布前需提交三个包尚未发布的新版本号；npm 不允许覆盖已有版本。预发布请使用 `1.1.0-beta.1` 这样的版本号，转正式版时使用新的正式版本号。初始化器会固定本次发布的双端版本。

`npm run build:npm` 依次编译 common、daemon、panel 和 frontend，直接生成 `npm-packages/` 下的三个发布目录。构建前需安装各目录的依赖，并将 `lib-urls.txt` 列出的原生工具和许可证下载到 `daemon/lib/`；发布 workflow 会自动完成这些准备。`npm run package:npm` 仅收集已有的 `panel/production`、`daemon/production`、内置插件编译结果和 `frontend/dist`，不执行构建或安装。输出目录已存在时可使用 `npm run build:npm -- --out <新目录>`，或 `npm run package:npm -- --out <新目录>`。

发布目录包含编译产物、内置插件、前端资源、CLI 和许可证，并排除运行数据、上传文件、`node_modules` 及本地 `file:../common` 依赖。工作流将三个 `.tgz` 保存为 Actions 的 `npm-packages` artifact，并向 npm 发布这些归档。旧的 `production-code` 构建、Linux／Windows 发行包和 Docker 镜像发布流程已移除。

本地可用 `npm run init:project -- /tmp/my-panel --no-install --yes` 检查项目初始化，无需构建或启动服务。

## 开发

确保你已经安装 [Node.js](https://nodejs.org)

1. 运行仓库根目录内的 “install-dependents” 脚本
2. 在仓库根目录运行 “npm run all” 或运行 “npm-dev-*” 脚本
3. 如需构建 npm 发布包，准备原生工具后运行 `npm run build:npm`
