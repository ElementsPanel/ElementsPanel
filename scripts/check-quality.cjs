const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { root, frontend, frontendRequire } = require("./quality-tools.cjs");

const lintExtension = /\.(?:[cm]?[jt]sx?|vue)$/;

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

async function checkLint(files, fix = false) {
  const engine = lintEngine(fix);
  const sources = files.filter((file) => lintExtension.test(file));
  if (!sources.length) throw new Error("No lint sources found");
  const results = await engine.lintFiles(sources);
  if (fix) await frontendRequire("eslint").ESLint.outputFixes(results);
  const failures = results.filter((result) => result.messages.length);
  console.log(`Lint checked ${results.length} files.`);
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
    options: { ...config, filepath: filename }
  };
}

async function checkFormat(files, write = false) {
  const prettier = frontendRequire("prettier");
  let checked = 0;
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
  console.log(`Format checked ${checked} files.`);
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
  const files = qualityFiles();
  const success =
    mode === "lint"
      ? await checkLint(files, flag === "--fix")
      : await checkFormat(files, flag === "--write");
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
  lintEngine,
  formatInput,
  checkLint,
  checkFormat
};
