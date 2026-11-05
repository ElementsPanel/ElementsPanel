<div align="center">

<img src="logo-w.svg#gh-dark-mode-only" width="45%">
<img src="logo-b.svg#gh-light-mode-only" width="45%">

# ElementsPanel

一款基于 [MCSManager](https://www.mcsmanager.com) 和 [Cordis](https://github.com/cordiverse/cordis) 的游戏面板

</div>

## 开发

确保你已经安装 [Node.js](https://nodejs.org)

1. 运行仓库根目录内的 “install-dependents” 脚本
2. 在仓库根目录运行 “npm run all” 或运行 “npm-dev-*” 脚本启动开发服务器

## 插件产物与公开接口

前端宿主和每个插件由 `scripts/build-frontend.mjs` 分别创建独立构建图。插件的入口、私有 JS、CSS、字体和图片归属自己的 `frontend/` 目录，不引用宿主或其他插件某次构建生成的哈希文件。仅重建宿主不会要求重新发布插件。

跨插件引用使用 `@elementspanel/epanel-plugin-<id>/<module>`，公开入口在插件 `package.json` 的 `elementspanel.panel.frontendExports` 中声明，并通过 `panel/src/public/` 导出。宿主服务使用 `@elements-panel/sdk`；共享框架模块由 `core/frontend/plugin-sdk.config.mjs` 列出。构建会拒绝跨插件私有源码引用和未声明的共享模块子路径。

构建产物记录 `frontendApi`、`frontendImports` 和 `frontendExports`。打包、初始化和单插件更新检查所需接口；更新还会检查已有消费者，失败时回滚。浏览器在加载插件前安装公开模块映射，接口提供插件的产物发生变化时刷新页面，保持路由、状态和服务实例一致。

独立发布仍需保持公开接口兼容：同名接口不能随意删除导出或改变行为。旧版插件若仍引用宿主哈希资源，会继续执行旧版资源校验；升级到独立产物格式后才消除这类构建绑定。
