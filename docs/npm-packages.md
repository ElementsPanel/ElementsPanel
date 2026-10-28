# npm 包

需要 Node.js 22.15 或更新版本。安装入口为 `create-elementspanel`，两个运行包为 `@elementspanel/panel` 和 `@elementspanel/daemon`：

```sh
npm init elementspanel@latest my-panel
cd my-panel
npm start
```

内置插件按功能发布为 `@elementspanel/epanel-plugin-*`。例如，`epanel-plugin-instance` 包同时包含 panel 和 daemon 两端；`epanel-plugin-console` 只包含 panel 端。运行包在 `dependencies` 中固定对应插件版本，初始化器安装运行包时会自动安装这些依赖。

每个插件包的 `package.json` 使用 `elementspanel.id` 声明插件 ID，`elementspanel.panel`／`elementspanel.daemon` 声明对应目录和公共资源目录名。插件代码、样式和 `plugin.json` 位于包内的 `panel/` 或 `daemon/`；用户配置仍存放在安装目录的 `data/plugin-overrides.json`。插件包通过可选 peer dependencies 声明匹配的主程序版本，单独安装 panel 或 daemon 时不会拉入另一端。

主程序从自己的 npm 依赖中解析插件，支持依赖提升和嵌套安装。浏览器资源仍通过 `/plugins/` 提供。插件依赖的 Cordis 与宿主共享实例；主程序提供其他运行时依赖和浏览器 SDK。主程序包中不再复制内置插件目录。

仓库中的内置插件源码继续位于 `panel/plugins/` 和 `daemon/plugins/`。第三方插件工作区只在初始化后的项目中创建，位于 `external/*`，由项目自己的 npm workspace 脚本构建和发布；仓库源码不扫描第三方工作区。

初始化后的项目可以这样创建和构建第三方插件：

```sh
npm run setup -- example
npm run build -- example
npm start
```

工作区默认创建 panel 插件；`npm run setup -- example --both` 同时创建 daemon 端。源码位于工作区的 `panel/src/` 或 `daemon/src/`，构建结果写入对应的 `backend/` 和 `frontend/` 目录，并通过项目的 npm 依赖映射加载。修改插件版本后，运行 `npm run pub -- example` 构建并发布 npm 包。

安装根目录、common、panel、daemon、frontend 的依赖，将 `lib-urls.txt` 中的工具和许可证下载到 `daemon/lib/` 后，运行 `npm run build:npm` 生成 `npm-packages/`。已有编译结果时，`npm run package:npm` 只收集和校验产物；目标输出目录存在时会在新产物准备完成后静默替换，也可追加 `-- --out <新目录>`。

输出包含两个运行包、初始化器，以及每个内置插件的独立目录。版本分别沿用运行包和 `plugin.json` 中的版本号；一个插件的双端版本必须一致。编译测试 workflow 会打包所有目录并保存 `.tgz` artifact，npm 发布由维护者手动执行。

发布前确认账号拥有包名及 `@elementspanel` scope 的权限，并使用尚未发布过的版本号。先发布所有插件包，再发布运行包和初始化器：

```sh
npm login
for package_directory in ./npm-packages/epanel-plugin-*/; do
  npm publish "$package_directory" --access public
done
npm publish ./npm-packages/daemon --access public
npm publish ./npm-packages/panel --access public
npm publish ./npm-packages/create-elementspanel --access public
```

也可以下载 CI 的 artifact，按同样顺序发布其中的 `.tgz`。预发布使用预发布版本号，并在发布命令中添加 `--tag next`。更新 npm 插件后重启对应服务；内置依赖由 npm 管理，面板中的开关和配置写入用户目录。
