// VS Code keybindings generation (Step 8 in PLAN.md).

import { loadMappings, lookupIntent } from "../registry.js";

const MODE_TO_SECTION = {
  n: "vim.normalModeKeyBindings",
  v: "vim.visualModeKeyBindings",
  x: "vim.visualModeKeyBindings",
  s: "vim.visualModeKeyBindings",
  i: "vim.insertModeKeyBindings",
};

export function generateVSCodeBindings(keymaps = [], options = {}) {
  const registry = options.registry ?? loadMappings();
  const sections = {
    "vim.normalModeKeyBindings": [],
    "vim.visualModeKeyBindings": [],
    "vim.insertModeKeyBindings": [],
  };

  const seen = new Set();
  const manual = [];

  for (const keymap of keymaps) {
    const intent = readString(keymap.intent);
    const lhs = readString(keymap.lhs);
    const mode = normalizeMode(keymap.mode);
    if (!intent || !lhs || !mode) {
      continue;
    }

    const command = lookupIntent(intent, "vscode", registry);
    if (!command) {
      manual.push({ lhs, intent });
      continue;
    }

    const before = toBeforeTokens(lhs);
    if (before.length === 0) {
      manual.push({ lhs, intent });
      continue;
    }

    const section = MODE_TO_SECTION[mode];
    const entryKey = `${section}|${before.join(",")}|${command}`;
    if (seen.has(entryKey)) {
      continue;
    }
    seen.add(entryKey);

    sections[section].push({
      before,
      commands: [command],
    });
  }

  return {
    ...sections,
    _meta: {
      generated: Object.values(sections).reduce(
        (sum, list) => sum + list.length,
        0,
      ),
      manual: manual.length,
      manual_examples: manual.slice(0, 20),
    },
  };
}

function normalizeMode(mode) {
  if (typeof mode !== "string" || !MODE_TO_SECTION[mode]) {
    return null;
  }
  return mode;
}

function readString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function toBeforeTokens(lhs) {
  const tokens = [];
  let i = 0;

  while (i < lhs.length) {
    const ch = lhs[i];
    if (ch === "<") {
      const end = lhs.indexOf(">", i + 1);
      if (end === -1) {
        return [];
      }
      const token = lhs.slice(i + 1, end).trim();
      const mapped = mapSpecialToken(token);
      if (!mapped) {
        return [];
      }
      tokens.push(mapped);
      i = end + 1;
      continue;
    }

    tokens.push(ch);
    i += 1;
  }

  return tokens.filter(Boolean);
}

function mapSpecialToken(token) {
  const raw = token.toLowerCase();
  if (raw === "leader") return "<leader>";
  if (raw === "cr" || raw === "enter" || raw === "return") return "enter";
  if (raw === "esc" || raw === "escape") return "escape";
  if (raw === "tab") return "tab";
  if (raw === "space") return "<space>";
  if (raw === "bs" || raw === "backspace") return "backspace";
  if (raw === "lt") return "<";

  const ctrl = raw.match(/^c-(.)$/);
  if (ctrl) return `ctrl+${ctrl[1]}`;

  const shift = raw.match(/^s-(.)$/);
  if (shift) return `shift+${shift[1]}`;

  const alt = raw.match(/^a-(.)$/);
  if (alt) return `alt+${alt[1]}`;

  return raw;
}
