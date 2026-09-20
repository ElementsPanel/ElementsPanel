#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const externalRoot = path.join(projectRoot, "external");

function printUsage() {
  console.error("Usage: npm run create-plugin -- <plugin-folder> [--force]");
  console.error("Creates external/<plugin-folder>/{panel,daemon} development sources.");
}

function normalizeFolder(value) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "");
  if (!normalized) throw new Error("Plugin folder must contain a letter or number.");
  return normalized;
}

const args = process.argv.slice(2);
const force = args.includes("--force");
const names = args.filter((arg) => arg !== "--force");
if (names.length !== 1 || names[0].startsWith("-")) {
  printUsage();
  process.exitCode = 1;
} else {
  try {
    const folder = normalizeFolder(names[0]);
    const workspace = path.join(externalRoot, folder);
    const files = {
      "panel/plugin.json": `${JSON.stringify(
        {
          id: folder,
          name: `${folder} panel plugin`,
          version: "0.1.0",
          description: "A custom ElementsPanel panel plugin.",
          priority: 100,
          backend: "src/backend/index.ts",
          frontend: "src/frontend.ts"
        },
        null,
        2
      )}\n`,
      "panel/src/backend/index.ts": `import type { PanelPluginContext } from "../../../../../panel/src/app/plugin";

export const inject: string[] = [];

export function apply(ctx: PanelPluginContext) {
  ctx.logger.info("Custom panel plugin loaded.");
}
`,
      "panel/src/frontend.ts": `import type { PanelFrontendPluginContext } from "../../../../frontend/src/plugin";

export const inject = ["console"];

export function apply(ctx: PanelFrontendPluginContext) {
  ctx.logger.info("Custom panel frontend plugin loaded.");
}
`,
      "daemon/plugin.json": `${JSON.stringify(
        {
          id: folder,
          name: `${folder} daemon plugin`,
          version: "0.1.0",
          description: "A custom ElementsPanel daemon plugin.",
          priority: 100,
          backend: "src/backend/index.ts"
        },
        null,
        2
      )}\n`,
      "daemon/src/backend/index.ts": `import type { DaemonPluginContext } from "../../../../../daemon/src/plugin";

export const inject: string[] = [];

export function apply(ctx: DaemonPluginContext) {
  ctx.logger.info("Custom daemon plugin loaded.");
}
`,
      "README.md": `# ${folder}

This custom plugin workspace is discovered while the ElementsPanel development
servers are running. The panel and daemon halves are kept independent:

- \`panel/\` contains the panel backend and frontend sources.
- \`daemon/\` contains the daemon backend sources.

Publish it to the plugin market with:

\`\`\`bash
npm run publish-plugin -- ${folder}
\`\`\`

That compiles both halves and uploads the result, which the market puts in its
review queue. Production builds still ignore \`external/\`: a published plugin is
installed from the market, not from this directory.
`
    };

    if (!force) {
      try {
        await fs.access(workspace);
        throw new Error(`Plugin workspace already exists: external/${folder} (use --force to overwrite).`);
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
    }

    for (const [relative, content] of Object.entries(files)) {
      const target = path.join(workspace, relative);
      await fs.mkdir(path.dirname(target), { recursive: true });
      if (!force) {
        try {
          await fs.access(target);
          throw new Error(`Refusing to overwrite ${path.relative(projectRoot, target)}.`);
        } catch (error) {
          if (error?.code !== "ENOENT") throw error;
        }
      }
      await fs.writeFile(target, content, "utf8");
    }

    console.log(`Created custom plugin workspace: external/${folder}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
