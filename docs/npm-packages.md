# npm 包

需要 Node.js 22.15 或更新版本。安装入口为 `init-elementspanel`，两个运行包为 `@elementspanel/panel` 和 `@elementspanel/daemon`：

```sh
npx init-elementspanel@latest my-panel
cd my-panel
npm start
```

内置插件按功能发布为 `@elementspanel/epanel-plugin-*`。例如，`epanel-plugin-instance` 包同时包含 panel 和 daemon 两端；`epanel-plugin-console` 只包含 panel 端。运行包在 `dependencies` 中固定对应插件版本，初始化器安装运行包时会自动安装这些依赖。

插件包在 `package.json` 中声明插件 ID 和 panel/daemon 目录。安装记录写入项目 `package.json` 的 `elementspanel.plugins`，项目级插件默认停用；用户启用状态和配置存放在 `data/plugin-overrides.json`。插件包通过 peer dependencies 声明兼容的运行包版本。

主程序从 npm 依赖中解析插件，支持依赖提升和嵌套安装。主程序包不复制内置插件目录；缺失的非核心插件会被跳过，核心插件缺失才会阻止启动。

内置插件源码位于 `panel/plugins/` 和 `daemon/plugins/`。第三方插件工作区只在初始化后的项目 `external/*` 中创建。

初始化后的项目可以这样创建和构建第三方插件：

```sh
npm run setup -- example
npm run build -- example
npm start
```

默认创建 panel 插件；使用 `npm run setup -- example --both` 创建双端插件。构建后在插件配置中启用，发布使用 `npm run pub -- example`。

安装根目录、common、panel、daemon、frontend 的依赖后，运行 `npm run build:npm` 生成 `npm-packages/`。daemon npm 包不携带平台二进制库；初始化项目首次启动 daemon 时，会将当前平台需要的工具下载到 `daemon/lib/`，与 `data/` 和 `logs/` 同级。已有编译结果时，`npm run package:npm` 只收集和校验产物；目标输出目录存在时会在新产物准备完成后静默替换，也可追加 `-- --out <新目录>`。

输出包含两个运行包、初始化器，以及每个内置插件的独立目录。版本分别沿用运行包和 `plugin.json` 中的版本号；一个插件的双端版本必须一致。编译测试 workflow 会打包所有目录并保存 `.tgz` artifact，npm 发布由维护者手动执行。

发布前确认账号拥有包名及 `@elementspanel` scope 的权限，并使用尚未发布过的版本号。先发布所有插件包，再发布运行包和初始化器：

```sh
npm login
for package_directory in ./npm-packages/epanel-plugin-*/; do
  npm publish "$package_directory" --access public
done
npm publish ./npm-packages/daemon --access public
npm publish ./npm-packages/panel --access public
npm publish ./npm-packages/init-elementspanel --access public
```

也可以下载 CI 的 artifact，按同样顺序发布其中的 `.tgz`。预发布使用预发布版本号，并在发布命令中添加 `--tag next`。更新 npm 插件后重启对应服务；内置依赖由 npm 管理，面板中的开关和配置写入用户目录。
