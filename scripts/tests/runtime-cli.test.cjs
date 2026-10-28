const assert = require("node:assert/strict");
const { PassThrough } = require("node:stream");
const { test } = require("node:test");
const { pipeWorkerOutput, workerEnvironment } = require("../runtime/cli.cjs");

test("worker output receives a side prefix across split stdout chunks", () => {
  const originalForceColor = process.env.FORCE_COLOR;
  const originalNoColor = process.env.NO_COLOR;
  delete process.env.FORCE_COLOR;
  delete process.env.NO_COLOR;
  const source = new PassThrough();
  const output = [];
  const target = { write: (value) => output.push(value) };
  try {
    const flush = pipeWorkerOutput(source, target, "daemon");

    source.write("first line\nsecond");
    source.end(" line\nlast line");
    flush();

    assert.equal(output.join(""), "[daemon] first line\n[daemon] second line\n[daemon] last line\n");
  } finally {
    if (originalForceColor === undefined) delete process.env.FORCE_COLOR;
    else process.env.FORCE_COLOR = originalForceColor;
    if (originalNoColor === undefined) delete process.env.NO_COLOR;
    else process.env.NO_COLOR = originalNoColor;
  }
});

test("worker prefixes use cyan for daemon and green for panel on terminals", () => {
  const originalForceColor = process.env.FORCE_COLOR;
  const originalNoColor = process.env.NO_COLOR;
  delete process.env.FORCE_COLOR;
  delete process.env.NO_COLOR;
  try {
    const render = (side) => {
      const source = new PassThrough();
      const output = [];
      const flush = pipeWorkerOutput(source, { isTTY: true, write: (value) => output.push(value) }, side);
      source.end("line\n");
      flush();
      return output.join("");
    };
    assert.equal(render("daemon"), "\u001b[36m[daemon]\u001b[39m line\n");
    assert.equal(render("panel"), "\u001b[32m[panel]\u001b[39m line\n");
  } finally {
    if (originalForceColor === undefined) delete process.env.FORCE_COLOR;
    else process.env.FORCE_COLOR = originalForceColor;
    if (originalNoColor === undefined) delete process.env.NO_COLOR;
    else process.env.NO_COLOR = originalNoColor;
  }
});

test("worker environments preserve explicit color settings and propagate terminal colors", () => {
  const originalStdoutTTY = process.stdout.isTTY;
  const originalStderrTTY = process.stderr.isTTY;
  const originalForceColor = process.env.FORCE_COLOR;
  const originalNoColor = process.env.NO_COLOR;
  Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: true });
  Object.defineProperty(process.stderr, "isTTY", { configurable: true, value: false });
  try {
    delete process.env.FORCE_COLOR;
    delete process.env.NO_COLOR;
    const plan = { project: "/tmp/project", localDaemonConfig: undefined };
    const colored = workerEnvironment(plan, { side: "panel" });
    assert.equal(colored.FORCE_COLOR, "3");

    process.env.FORCE_COLOR = "0";
    assert.equal(workerEnvironment(plan, { side: "daemon" }).FORCE_COLOR, "0");
    delete process.env.FORCE_COLOR;
    process.env.NO_COLOR = "1";
    assert.equal(workerEnvironment(plan, { side: "daemon" }).FORCE_COLOR, undefined);
  } finally {
    if (originalStdoutTTY === undefined) delete process.stdout.isTTY;
    else Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: originalStdoutTTY });
    if (originalStderrTTY === undefined) delete process.stderr.isTTY;
    else Object.defineProperty(process.stderr, "isTTY", { configurable: true, value: originalStderrTTY });
    if (originalForceColor === undefined) delete process.env.FORCE_COLOR;
    else process.env.FORCE_COLOR = originalForceColor;
    if (originalNoColor === undefined) delete process.env.NO_COLOR;
    else process.env.NO_COLOR = originalNoColor;
  }
});
