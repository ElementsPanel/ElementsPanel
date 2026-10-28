const assert = require("node:assert/strict");
const { PassThrough } = require("node:stream");
const { test } = require("node:test");
const { pipeWorkerOutput } = require("../runtime/cli.cjs");

test("worker output receives a side prefix across split stdout chunks", () => {
  const source = new PassThrough();
  const output = [];
  const target = { write: (value) => output.push(value) };
  const flush = pipeWorkerOutput(source, target, "daemon");

  source.write("first line\nsecond");
  source.end(" line\nlast line");
  flush();

  assert.equal(output.join(""), "[daemon] first line\n[daemon] second line\n[daemon] last line\n");
});
