# create-elementspanel

Create an ElementsPanel installation with Node.js 22.15 or newer:

```sh
npm init elementspanel@latest my-panel
cd my-panel
npm start
```

The initializer offers a full installation, panel only, or daemon only. It installs precompiled runtime packages and pins their versions in the generated project. A full installation starts both processes and connects the local daemon automatically.

Use `.` to initialize an empty current directory. For non-interactive initialization, pass `-- --template full --yes`; the other templates are `panel` and `daemon`. `--no-install` only generates the project, so run `npm install` before `npm start`.

The destination must be empty (an existing `.git` directory is allowed). Initialization never overwrites an existing deployment. If dependency installation fails, enter the generated directory and retry `npm install`.

Runtime code lives in `node_modules`; configuration, instances, plugins, logs and uploads live in the project's `panel` and `daemon` directories. Stop the service and back up these directories before upgrading packages.
