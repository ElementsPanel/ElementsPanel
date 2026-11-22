const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const { root, frontend, frontendRequire } = require("./quality-tools.cjs");

const baselinePath = path.join(__dirname, "quality-baseline.json");
const lintExtension = /\.(?:[cm]?[jt]sx?|vue)$/;
const digest = (value) => createHash("sha256").update(value).digest("hex");
const sourceDigest = (source) => digest(source.replace(/\r\n/g, "\n"));

function qualityFiles(directory = root) {
  return [
    ...new Set(
      execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
        cwd: directory,
        encoding: "utf8"
      })
        .split("\0")
        .filter(Boolean)
    )
  ]
    .filter((file) => fs.existsSync(path.join(directory, file)))
    .sort();
}

function matchesBaseline(entry, source, signature) {
  // Only identical source and diagnostics/configuration retain the migration exemption.
  return entry?.source === sourceDigest(source) && entry.signature === digest(signature);
}

function lintSignature(messages) {
  return JSON.stringify(
    messages.map(({ ruleId, severity, message, line, column, endLine, endColumn }) => ({
      ruleId,
      severity,
      message,
      line,
      column,
      endLine,
      endColumn
    }))
  );
}

function lintEngine(fix = false) {
  const { ESLint } = frontendRequire("eslint");
  return new ESLint({
    cwd: root,
    useEslintrc: false,
    overrideConfigFile: path.join(root, ".eslintrc.cjs"),
    resolvePluginsRelativeTo: frontend,
    ignore: false,
    fix
  });
}

async function checkLint(files, baseline, fix = false) {
  const engine = lintEngine(fix);
  const sources = files.filter((file) => lintExtension.test(file));
  if (!sources.length) throw new Error("No lint sources found");
  const results = await engine.lintFiles(sources);
  if (fix) await frontendRequire("eslint").ESLint.outputFixes(results);
  const failures = [];
  let known = 0;
  for (const result of results) {
    if (!result.messages.length) continue;
    const file = path.relative(root, result.filePath).split(path.sep).join("/");
    const source = fs.readFileSync(result.filePath, "utf8");
    if (
      !result.fatalErrorCount &&
      matchesBaseline(baseline[file], source, lintSignature(result.messages))
    ) {
      known++;
    } else {
      failures.push(result);
    }
  }
  console.log(
    `Lint checked ${results.length} files; ${known} unchanged files have known diagnostics.`
  );
  if (failures.length) {
    const formatter = await engine.loadFormatter("stylish");
    console.error(formatter.format(failures));
  }
  return failures.length === 0;
}

async function formatInput(file) {
  const prettier = frontendRequire("prettier");
  const filename = path.join(root, file);
  const info = await prettier.getFileInfo(filename, {
    ignorePath: path.join(root, ".prettierignore"),
    resolveConfig: true
  });
  if (info.ignored || !info.inferredParser) return;
  const config = await prettier.resolveConfig(filename);
  return {
    source: fs.readFileSync(filename, "utf8"),
    options: { ...config, filepath: filename },
    signature: JSON.stringify({ version: prettier.version, parser: info.inferredParser, config })
  };
}

async function checkFormat(files, baseline, write = false) {
  const prettier = frontendRequire("prettier");
  let checked = 0;
  let known = 0;
  let failures = 0;
  for (const file of files) {
    try {
      const input = await formatInput(file);
      if (!input) continue;
      checked++;
      const formatted = await prettier.format(input.source, input.options);
      if (formatted === input.source) continue;
      if (write) {
        fs.writeFileSync(path.join(root, file), formatted);
        console.log(`Formatted ${file}`);
      } else if (matchesBaseline(baseline[file], input.source, input.signature)) {
        known++;
      } else {
        failures++;
        console.error(`Formatting required: ${file}`);
      }
    } catch (error) {
      failures++;
      console.error(`${file}: ${error.message}`);
    }
  }
  if (!checked) throw new Error("No format sources found");
  console.log(
    `Format checked ${checked} files; ${known} unchanged files have known formatting debt.`
  );
  return failures === 0;
}

async function main(args = process.argv.slice(2)) {
  const [mode, flag] = args;
  if (
    args.length > 2 ||
    !["lint", "format"].includes(mode) ||
    (flag && flag !== (mode === "lint" ? "--fix" : "--write"))
  ) {
    throw new Error("Usage: node scripts/check-quality.cjs lint [--fix] | format [--write]");
  }
  process.chdir(root);
  const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
  if (baseline.version !== 1 || !baseline.lint || !baseline.format) {
    throw new Error("Invalid quality baseline");
  }
  const files = qualityFiles();
  const success =
    mode === "lint"
      ? await checkLint(files, baseline.lint, flag === "--fix")
      : await checkFormat(files, baseline.format, flag === "--write");
  if (!success) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  qualityFiles,
  matchesBaseline,
  sourceDigest,
  digest,
  lintSignature,
  lintEngine,
  formatInput,
  checkLint,
  checkFormat
};
