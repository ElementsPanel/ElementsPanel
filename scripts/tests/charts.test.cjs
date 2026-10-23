const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const { test } = require("node:test");

const root = path.resolve(__dirname, "../..");
const frontendRequire = Module.createRequire(path.join(root, "frontend/package.json"));
const ts = frontendRequire("typescript");
const vue = frontendRequire("vue");

function load(relative, overrides, source) {
  const filename = path.join(root, relative);
  const mod = new Module(filename, module);
  mod.require = (id) => Object.hasOwn(overrides, id) ? overrides[id] : frontendRequire(id);
  mod._compile(ts.transpileModule(source ?? fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
  }).outputText, filename);
  return mod.exports;
}

function fixture(t, chartModule) {
  const mounted = [], beforeUnmount = [], charts = [];
  const scope = vue.effectScope();
  let disposed = false;
  class FakeChart {
    static register() {}
    constructor(canvas, config) {
      this.canvas = canvas;
      this.config = config;
      this.data = config.data;
      this.options = config.options;
      this.updates = [];
      this.destroyed = 0;
      charts.push(this);
    }
    update(mode) { this.updates.push(mode); }
    destroy() { this.destroyed++; }
  }
  const lifecycle = {
    ...vue,
    onMounted: (callback) => mounted.push(callback),
    onBeforeUnmount: (callback) => beforeUnmount.push(callback)
  };
  const imports = {
    vue: lifecycle,
    "chart.js": chartModule ?? Object.fromEntries([
      ["Chart", FakeChart],
      ...["CategoryScale", "LinearScale", "LineController", "LineElement", "PointElement", "Filler", "Tooltip"]
        .map((name) => [name, {}])
    ])
  };
  const hooks = load("panel/plugins/console/src/hooks/useOverviewChart.ts", imports);
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    beforeUnmount.forEach((callback) => callback());
    scope.stop();
  };
  t.after(dispose);
  return {
    hooks, charts, dispose,
    run: (callback) => scope.run(callback),
    mount: () => Promise.all(mounted.map((callback) => callback())),
    setupSfc(relative, overrides) {
      const { parse, compileScript } = frontendRequire("@vue/compiler-sfc");
      const { descriptor } = parse(fs.readFileSync(path.join(root, relative), "utf8"));
      const script = compileScript(descriptor, { id: "chart-test" });
      return scope.run(() => load(relative, {
        vue: lifecycle,
        "vuetify/components": {},
        "@/lang/i18n": { t: (key) => key },
        ...overrides
      }, script.content).default.setup({}, { expose() {} }));
    }
  };
}

test("node histories initialize with available data, update nested values and release their chart", async (t) => {
  const f = fixture(t);
  const values = vue.ref([10, 20]);
  const hook = f.run(() => f.hooks.useSimpleChart(vue.shallowRef({}), () => values.value));
  values.value.push(30);
  await vue.nextTick();
  assert.equal(f.charts.length, 0);
  await f.mount();
  const chart = f.charts[0];
  assert.equal(hook.instance.value, chart);
  assert.equal(vue.isProxy(hook.instance.value), false);
  assert.deepEqual(chart.data.labels, ["0", "1", "2"]);
  assert.deepEqual(chart.data.datasets[0].data, [10, 20, 30]);
  assert.notEqual(chart.data.datasets[0].data, values.value);
  assert.equal(chart.options.scales.y.max, 100);
  assert.equal(chart.options.plugins.tooltip.callbacks.label({ parsed: { y: 23.456 } }), "23.5%");
  // The hover card is custom-styled and shows only the plotted value.
  assert.equal(chart.options.plugins.tooltip.callbacks.title(), "");
  assert.equal(chart.options.plugins.tooltip.displayColors, false);
  assert.equal(chart.options.plugins.tooltip.backgroundColor, "rgba(20, 24, 35, 0.85)");
  assert.equal(chart.options.plugins.tooltip.borderWidth, undefined);
  assert.equal(chart.options.plugins.tooltip.bodyColor, "#e0e6f0");
  values.value[1] = 45;
  await vue.nextTick();
  assert.deepEqual(chart.data.datasets[0].data, [10, 45, 30]);
  assert.deepEqual(chart.updates, ["none"]);
  values.value = [];
  await vue.nextTick();
  assert.deepEqual(chart.data.labels, []);
  assert.deepEqual(chart.data.datasets[0].data, []);
  f.dispose();
  assert.equal(chart.destroyed, 1);
  assert.equal(hook.instance.value, undefined);
  values.value.push(50);
  await vue.nextTick();
  assert.equal(chart.updates.length, 2);
});

test("monitoring charts map request and instance histories independently and retain count scales", async (t) => {
  const f = fixture(t);
  const state = vue.ref({
    totalInstance: 3,
    chart: { request: [{ value: 2, runningInstance: 1 }, { value: 0, runningInstance: 3 }] }
  });
  const overviewHook = load("panel/plugins/monitor/src/hooks/useOverviewChart.ts", {
    "@/hooks/useOverviewChart": f.hooks
  });
  const page = f.setupSfc("panel/plugins/monitor/src/normal/OverviewPage.vue", {
    "@/hooks/useOverviewInfo": { useOverviewInfo: () => ({ state }) },
    "../hooks/useOperationLog": { useOperationLog: () => ({ fetchData() {}, formattedLogs: vue.ref([]) }) },
    "../hooks/useOverviewChart": overviewHook
  });
  page.requestChartCanvas.value = {};
  page.instanceChartCanvas.value = {};
  await f.mount();
  const [request, instances] = f.charts;
  assert.deepEqual(request.data.labels, ["1s", "0s"]);
  assert.deepEqual(request.data.datasets[0].data, [2, 0]);
  assert.deepEqual(instances.data.datasets[0].data, [1, 3]);
  assert.equal(request.options.scales.y.max, 2);
  assert.equal(instances.options.scales.y.max, 3);
  assert.equal(request.options.scales.x.display, true);
  assert.equal(request.options.scales.y.ticks.callback(2), 2);
  assert.equal(instances.options.plugins.tooltip.callbacks.label({ parsed: { y: 3 } }), "3");
  state.value.totalInstance = 2;
  state.value.chart.request[0] = { value: 5, runningInstance: 4 };
  await vue.nextTick();
  assert.deepEqual(request.data.datasets[0].data, [5, 0]);
  assert.deepEqual(instances.data.datasets[0].data, [4, 3]);
  assert.equal(request.options.scales.y.max, 5);
  assert.equal(instances.options.scales.y.max, 4, "past counts must not be clipped after instance deletion");
  state.value.chart.request = [];
  await vue.nextTick();
  assert.deepEqual(request.data.datasets[0].data, []);
  assert.equal(request.options.scales.y.max, 1);
});

test("area gradients are isolated between canvases and recreated after the drawing area resizes", async (t) => {
  const f = fixture(t);
  f.run(() => {
    f.hooks.useSimpleChart(vue.shallowRef({}), () => [10]);
    f.hooks.useSimpleChart(vue.shallowRef({}), () => [20]);
  });
  await f.mount();
  const renderContext = () => ({
    chartArea: { top: 6, bottom: 74 },
    ctx: { createLinearGradient: () => ({ stops: [], addColorStop(...stop) { this.stops.push(stop); } }) }
  });
  const first = renderContext(), second = renderContext();
  const cpuFill = f.charts[0].data.datasets[0].backgroundColor;
  const memFill = f.charts[1].data.datasets[0].backgroundColor;
  const gradient = cpuFill({ chart: first });
  assert.equal(cpuFill({ chart: first }), gradient);
  assert.notEqual(memFill({ chart: second }), gradient);
  first.chartArea.bottom = 104;
  const resized = cpuFill({ chart: first });
  assert.notEqual(resized, gradient);
  assert.deepEqual(resized.stops.map(([offset]) => offset), [0, 0.6, 1]);
});

test("Chart.js can render, update, resize and destroy the configured line chart", async (t) => {
  const chartModule = frontendRequire("chart.js");
  const f = fixture(t, chartModule);
  const canvas = { width: 320, height: 78, getContext: () => context };
  const context = new Proxy({
    canvas,
    measureText: (text) => ({ width: String(text).length * 6 }),
    createLinearGradient: () => ({ addColorStop() {} })
  }, {
    get: (target, key) => key in target ? target[key] : () => {},
    set: (target, key, value) => { target[key] = value; return true; }
  });
  const values = vue.ref([10, 50, 30]);
  const hook = f.run(() => f.hooks.useSimpleChart(vue.shallowRef(canvas), () => values.value));
  await f.mount();
  const chart = hook.instance.value;
  assert.ok(chart.ctx);
  assert.equal(chart.getDatasetMeta(0).data.length, 3);
  assert.equal(chart.scales.y.max, 100);
  values.value.push(70);
  await vue.nextTick();
  assert.equal(chart.getDatasetMeta(0).data.length, 4);
  chart.resize(480, 120);
  assert.equal(chart.width, 480);
  assert.equal(chart.height, 120);
  f.dispose();
  assert.equal(chartModule.Chart.getChart(canvas), undefined);
});
