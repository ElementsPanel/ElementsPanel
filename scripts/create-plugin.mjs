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
          // The market reads these: `id` is the slug a plugin is published under,
          // and the rest is what its page shows. Edit them here, not at upload time.
          displayName: `${folder} panel plugin`,
          version: "0.1.0",
          description: "A custom ElementsPanel panel plugin.",
          summary: "A custom ElementsPanel panel plugin.",
          category: "",
          changelog: "",
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
      "panel/src/frontend.ts": `import type { PanelFrontendPluginContext } from "@elements-panel/sdk";

export const inject = ["console"];

export function apply(ctx: PanelFrontendPluginContext) {
  ctx.logger.info("Custom panel frontend plugin loaded.");
}
`,
      "daemon/plugin.json": `${JSON.stringify(
        {
          id: folder,
          name: `${folder} daemon plugin`,
          displayName: `${folder} daemon plugin`,
          version: "0.1.0",
          description: "A custom ElementsPanel daemon plugin.",
          summary: "A custom ElementsPanel daemon plugin.",
          category: "",
          changelog: "",
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
      // 这两份是插件对使用者说的话，会随包发布、在插件市场的「自述」页签里按 markdown
      // 渲染。与工作区根目录的 README.md 不同，那份是写给开发者的。
      "panel/README.md": `# ${folder} panel plugin

这一份是插件的自述：发布后会随包上传，在插件市场的「自述」页签里按 markdown 显示。

## 它做什么

在这里写清楚插件做什么、怎么配置、有什么注意事项。

## 用法

\`\`\`bash
# 发布到插件市场
npm run publish-plugin -- ${folder}
\`\`\`
`,
      "daemon/README.md": `# ${folder} daemon plugin

这一份是插件的自述：发布后会随包上传，在插件市场的「自述」页签里按 markdown 显示。
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
review queue. Everything the market shows — display name, version, summary,
description, category, changelog — is read from \`panel/plugin.json\` (or
\`daemon/plugin.json\` for a daemon-only workspace), so edit it there. Only
\`--version\` and \`--changelog\` are worth passing per upload.

The plugin's own description for users lives in \`panel/README.md\` (or
\`daemon/README.md\`): it is packaged with the plugin and rendered on the market's
自述 tab. This file is the developer's guide, and is not published.

The plugin's face on the market is \`icon.png\` at the root of this workspace.
Unlike the manifest and the readme, it is not per half: put one PNG here (at most
1 MiB), and it is packaged with the plugin into the half the market reads first.
Without it the market falls back to its default puzzle icon.

Production builds still ignore \`external/\`: a published plugin is installed
from the market, not from this directory.
`
    };

    if (!force) {
      try {
        await fs.access(workspace);
        throw new Error(
          `Plugin workspace already exists: external/${folder} (use --force to overwrite).`
        );
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
