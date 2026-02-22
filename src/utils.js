import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const TEMPLATES_DIR = join(ROOT, "templates");

const MODE_TO_MAP = {
  n: { noremap: "nnoremap", map: "nmap" },
  i: { noremap: "inoremap", map: "imap" },
  v: { noremap: "vnoremap", map: "vmap" },
  x: { noremap: "xnoremap", map: "xmap" },
  s: { noremap: "snoremap", map: "smap" },
  o: { noremap: "onoremap", map: "omap" },
  c: { noremap: "cnoremap", map: "cmap" },
  t: { noremap: "tnoremap", map: "tmap" },
};

function truthy(value) {
  return value === true || value === 1;
}

function readString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function loadDefaults() {
  try {
    const raw = readFileSync(join(TEMPLATES_DIR, "defaults.json"), "utf8");
    return JSON.parse(raw);
  } catch {
    return { keymaps: [] };
  }
}

export { ROOT, TEMPLATES_DIR, MODE_TO_MAP, truthy, readString, loadDefaults };
