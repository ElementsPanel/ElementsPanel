const readline = require("node:readline");

const RESET = "\x1b[0m";
const CYAN = "\x1b[36m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";

function paint(text, code) {
  if (process.env.NO_COLOR || !process.stdout.isTTY) return text;
  return `${code}${text}${RESET}`;
}

function resultLine(title, value, status) {
  const icon = status === "error" ? paint("✖ ", RED) : paint("✔ ", CYAN);
  const colored = status === "error" ? paint(value, RED) : paint(value, CYAN);
  return `${icon}${title} ${paint("›", DIM)} ${colored}`;
}

async function selectMenu({ title, options, hint = "", defaultIndex = 0 }) {
  if (!options?.length) throw new Error("selectMenu requires at least one option");
  return new Promise((resolve) => {
    let index = Math.min(Math.max(defaultIndex, 0), options.length - 1);
    let rendered = false;
    let frameLength = 0;
    readline.emitKeypressEvents(process.stdin);
    const wasRaw = process.stdin.isRaw;
    process.stdin.setRawMode(true);
    process.stdin.resume();

    function render() {
      const frame = [
        `${paint("◆ ", CYAN)}${title}`,
        ...options.map((option, position) =>
          position === index
            ? `${paint("❯ ", CYAN)}${paint(option.label, CYAN)}`
            : `  ${paint(option.label, DIM)}`
        )
      ];
      if (hint) frame.push(paint(hint, DIM));
      frameLength = frame.length;
      if (rendered) process.stdout.write(`\x1b[${frameLength}A\r\x1b[0J`);
      process.stdout.write(`${frame.join("\n")}\n`);
      rendered = true;
    }

    function cleanup() {
      process.stdin.removeListener("keypress", onKeypress);
      process.stdin.setRawMode(wasRaw ?? false);
      process.stdin.pause();
    }

    function finish() {
      cleanup();
      const selected = options[index];
      process.stdout.write(`\x1b[${frameLength}A\r\x1b[0J`);
      process.stdout.write(`${resultLine(title, selected.label, "done")}\n`);
      resolve(selected.value);
    }

    function onKeypress(chunk, key) {
      if (!key) return;
      if (key.ctrl && key.name === "c") {
        cleanup();
        process.stdout.write("\n");
        process.exit(130);
      }
      if (key.name === "up" || key.name === "k") {
        index = (index + options.length - 1) % options.length;
        render();
      } else if (key.name === "down" || key.name === "j") {
        index = (index + 1) % options.length;
        render();
      } else if (key.name === "return" || key.name === "enter") {
        finish();
      }
    }

    process.stdin.on("keypress", onKeypress);
    render();
  });
}

function textPrompt({ title, placeholder = "" }) {
  return new Promise((resolve) => {
    let placeholderVisible = false;
    // Registered before the interface so it runs ahead of readline's echo.
    const clearPlaceholder = () => {
      if (!placeholderVisible) return;
      placeholderVisible = false;
      process.stdout.write("\x1b[0K");
    };
    if (placeholder) process.stdin.on("keypress", clearPlaceholder);
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: `${paint("◆ ", CYAN)}${title} ${paint("›", DIM)} `
    });
    rl.prompt();
    if (placeholder) {
      process.stdout.write(`${paint(placeholder, DIM)}\x1b[${placeholder.length}D`);
      placeholderVisible = true;
    }
    rl.once("line", (answer) => {
      rl.close();
      process.stdin.removeListener("keypress", clearPlaceholder);
      const trimmed = answer.trim();
      resolve({
        value: answer,
        mark(status, display = trimmed || placeholder) {
          process.stdout.write(`\x1b[1A\r\x1b[0J${resultLine(title, display, status)}\n`);
        }
      });
    });
  });
}

module.exports = { selectMenu, textPrompt };
