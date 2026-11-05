const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");

const root = path.resolve(__dirname, "../..");
const from = (workspace) =>
  Module.createRequire(path.join(root, "core", workspace, "package.json"));
const ts = from("panel")("typescript");

const publicSourceAliases = new Map();
/** Resolve the declared public facade in source-only tests, retaining existing service mocks. */
function frontendTestImport(id, overrides = {}) {
  if (Object.hasOwn(overrides, id)) return id;
  if (!publicSourceAliases.has(id)) {
    const aliases = [];
    if (id === "@elements-panel/sdk") aliases.push("@/plugin/context", "@/plugin");
    const match = id.match(/^@elementspanel\/epanel-plugin-([^/]+)(?:\/(.+))?$/);
    if (match) {
      const directory = path.join(root, "plugins", match[1]);
      const metadata = JSON.parse(fs.readFileSync(path.join(directory, "package.json"), "utf8"));
      const entry = metadata.elementspanel.panel.frontendExports?.[match[2] || "."];
      if (entry) {
        const facade = path.join(directory, "panel", entry);
        const request = fs.readFileSync(facade, "utf8").match(/from\s+"([^"]+)"/)?.[1];
        const target = path.resolve(path.dirname(facade), request);
        const relative = path.relative(path.join(directory, "panel/src"), target).split(path.sep).join("/");
        const short = relative.replace(/\/index$/, "");
        for (const alias of match[1] === "console" ? ["@/", "@console/"]
          : match[1] === "i18n" ? ["@/"] : [`@${match[1]}/`]) {
          aliases.push(alias + short, alias + relative);
        }
      }
    }
    publicSourceAliases.set(id, aliases);
  }
  const aliases = publicSourceAliases.get(id);
  return aliases.find((alias) => Object.hasOwn(overrides, alias)) || aliases[0] || id;
}

// Run source in memory, replacing only the dependencies a test owns.
function transpile(filename, source = fs.readFileSync(filename, "utf8"), compiler = ts) {
  return compiler.transpileModule(source, {
    compilerOptions: {
      module: compiler.ModuleKind.CommonJS,
      target: compiler.ScriptTarget.ES2022,
      esModuleInterop: true
    },
    fileName: filename.endsWith(".vue") ? `${filename}.ts` : filename
  }).outputText;
}

function createLoader({ host, resolve, globals = false, transform, compiler = ts } = {}) {
  const hostRequire = host ? from(host) : null;
  return function load(relative, overrides = {}, input) {
    const filename = path.resolve(root, relative);
    const nativeRequire = Module.createRequire(filename);
    const side = filename.match(/[/\\]plugins[/\\][^/\\]+[/\\](panel|daemon)[/\\]/)?.[1];
    const workspace =
      side === "daemon"
        ? "daemon"
        : side === "panel"
        ? filename.includes(`${path.sep}backend${path.sep}`)
          ? "panel"
          : "frontend"
        : filename.match(/[/\\]core[/\\](panel|daemon|frontend|common)[/\\]/)?.[1];
    const fallback = workspace ? from(workspace) : null;
    const localRequire = Object.assign((id) => {
      if (!id.startsWith(".") && fallback) {
        try {
          return nativeRequire(id);
        } catch (error) {
          if (error.code !== "MODULE_NOT_FOUND") throw error;
        }
        return fallback(id);
      }
      return nativeRequire(id);
    }, nativeRequire);
    const mod = new Module(filename, module);
    mod.filename = filename;
    mod.paths = Module._nodeModulePaths(path.dirname(filename));
    mod.environment = globals ? input ?? {} : {};
    mod.require = (id) => {
      id = frontendTestImport(id, overrides);
      if (Object.hasOwn(overrides, id)) return overrides[id];
      if (resolve) return resolve(id, { filename, localRequire, load, overrides });
      return hostRequire && !id.startsWith(".") ? hostRequire(id) : localRequire(id);
    };
    let source = !globals && typeof input === "string" ? input : fs.readFileSync(filename, "utf8");
    if (transform) source = transform(source, filename, input);
    const bindings = Object.keys(mod.environment)
      .map((name) => `const ${name} = module.environment.${name};`)
      .join("\n");
    mod._compile(`${bindings}\n${transpile(filename, source, compiler)}`, filename);
    return mod.exports;
  };
}

function compileSfc(relative, options = {}) {
  const { parse, compileScript } = from("frontend")("@vue/compiler-sfc");
  const filename = path.resolve(root, relative);
  const { descriptor } = parse(fs.readFileSync(filename, "utf8"), { filename });
  return compileScript(descriptor, {
    id: "test",
    fs: {
      fileExists: (file) => fs.existsSync(file) && fs.statSync(file).isFile(),
      readFile: (file) => fs.readFileSync(file, "utf8")
    },
    ...options
  }).content;
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

function createBrowser(html = "<!doctype html><html><head></head><body></body></html>") {
  const { JSDOM, VirtualConsole } = from("frontend")("jsdom");
  const virtualConsole = new VirtualConsole();
  virtualConsole.sendTo(console, { omitJSDOMErrors: true });
  virtualConsole.on("jsdomError", (error) => {
    // jsdom 22 cannot parse Vuetify 4's theme cascade layers.
    if (error.type === "css parsing" && error.detail?.includes("@layer")) return;
    throw error;
  });
  const dom = new JSDOM(html, { pretendToBeVisual: true, url: "http://localhost", virtualConsole });
  for (const name of [
    "window",
    "document",
    "Element",
    "HTMLElement",
    "SVGElement",
    "ShadowRoot",
    "MouseEvent",
    "Node",
    "getComputedStyle",
    "CustomEvent",
    "localStorage",
    "history",
    "location"
  ])
    global[name] = dom.window[name];
  global.requestAnimationFrame = (callback) => setTimeout(() => callback(performance.now()), 16);
  global.cancelAnimationFrame = (handle) => clearTimeout(handle);
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  global.CSS = { supports: () => false };
  global.visualViewport = null;
  global.devicePixelRatio = 1;
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  return dom;
}

function mountSetup(t, component, props = {}) {
  const vue = from("frontend")("vue");
  component.render = () => null;
  const noop = () => {};
  const renderer = vue.createRenderer({
    createElement: () => ({}),
    createText: () => ({}),
    createComment: () => ({}),
    setText: noop,
    setElementText: noop,
    parentNode: () => null,
    nextSibling: () => null,
    insert: noop,
    remove: noop,
    patchProp: noop
  });
  const app = renderer.createApp(component, props);
  app.mount({});
  t.after(() => app.unmount());
  return { app, state: app._instance.setupState, props: app._instance.props };
}

module.exports = {
  frontendTestImport,
  root,
  from,
  transpile,
  createLoader,
  compileSfc,
  deferred,
  settle,
  createBrowser,
  mountSetup
};
