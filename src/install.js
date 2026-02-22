import { readFile, writeFile, access, mkdir, rename } from "node:fs/promises";
import { join } from "node:path";
import { homedir, platform } from "node:os";
import { ensureNamespaceDir, readMetadata, writeMetadata } from "./namespace.js";
import { MANAGED_BY_MARKER, VIM_KEYBINDING_SECTIONS } from "./generators/vscode.js";

const MARKER_START = '" <<< nvim-keymap-migrator start >>>';
const MARKER_END = '" >>> nvim-keymap-migrator end <<<';

function leaderToVSCodeFormat(leader) {
  if (leader === " ") return "<space>";
  if (leader === "\t") return "<tab>";
  if (leader === "\\") return "\\";
  if (leader === "\n") return "<cr>";
  if (leader === "\r") return "<cr>";
  return leader;
}

function leaderToIdeaVimFormat(leader) {
  if (leader === " ") return "\\<space>";
  if (leader === "\t") return "\\<tab>";
  if (leader === "\\") return "\\\\";
  if (leader === "\n") return "\\<cr>";
  if (leader === "\r") return "\\<cr>";
  if (leader.includes("<")) {
    return leader.replace(/</g, "\\<");
  }
  return leader;
}

function getIdeaVimrcPath() {
  return join(homedir(), ".ideavimrc");
}

function getVSCodeSettingsPath() {
  const p = platform();

  if (p === "darwin") {
    return join(homedir(), "Library/Application Support/Code/User/settings.json");
  }

  if (p === "win32") {
    const appData = process.env.APPDATA;
    if (appData) {
      return join(appData, "Code/User/settings.json");
    }
  }

  return join(homedir(), ".config/Code/User/settings.json");
}

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readTextFile(path, fallback = "") {
  try {
    return await readFile(path, "utf8");
  } catch {
    return fallback;
  }
}

async function readJsonFile(path, fallback = {}) {
  try {
    const content = await readFile(path, "utf8");
    return JSON.parse(content);
  } catch {
    return fallback;
  }
}

async function ensureDirForFile(filePath) {
  const dir = filePath.substring(0, filePath.lastIndexOf("/"));
  if (dir) {
    await mkdir(dir, { recursive: true });
  }
}

async function writeJsonAtomic(path, data) {
  const dir = path.substring(0, path.lastIndexOf("/"));
  const tempPath = join(dir, `.nkm-temp-${Date.now()}.json`);
  await writeFile(tempPath, JSON.stringify(data, null, 2), "utf8");
  await rename(tempPath, path);
}

function extractManagedBlock(content) {
  const startIdx = content.indexOf(MARKER_START);
  const endIdx = content.indexOf(MARKER_END);

  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    return { before: content, block: null, after: "" };
  }

  const before = content.slice(0, startIdx);
  const block = content.slice(startIdx, endIdx + MARKER_END.length);
  const after = content.slice(endIdx + MARKER_END.length);

  return { before, block, after };
}

function buildManagedBlock(mappings, leader) {
  const leaderLine = leader ? `let mapleader = "${leaderToIdeaVimFormat(leader)}"` : "";
  const leaderSection = leaderLine ? `${leaderLine}\n\n` : "";

  return `${MARKER_START}
" Managed by nvim-keymap-migrator. Run with --clean to remove.
${leaderSection}${mappings}
${MARKER_END}`;
}

async function integrateIdeaVim(mappings, options = {}) {
  const vimrcPath = getIdeaVimrcPath();
  const content = await readTextFile(vimrcPath, "");
  const { before, block, after } = extractManagedBlock(content);

  const managedBlock = buildManagedBlock(mappings, options.leader);

  if (block) {
    const newContent = before + managedBlock + after;
    await writeFile(vimrcPath, newContent, "utf8");
    return { integrated: true, updated: true };
  }

  const newContent = content.trim()
    ? `${content.trim()}\n\n${managedBlock}\n`
    : `${managedBlock}\n`;

  await writeFile(vimrcPath, newContent, "utf8");
  return { integrated: true, updated: false };
}

async function cleanIdeaVim() {
  const vimrcPath = getIdeaVimrcPath();
  const exists = await fileExists(vimrcPath);

  if (!exists) {
    return { cleaned: true, reason: "no_file" };
  }

  const content = await readTextFile(vimrcPath, "");
  const { before, block, after } = extractManagedBlock(content);

  if (!block) {
    return { cleaned: false, reason: "no_block" };
  }

  const cleaned = (before + after).trim();
  if (cleaned) {
    await writeFile(vimrcPath, cleaned + "\n", "utf8");
  } else {
    await writeFile(vimrcPath, "", "utf8");
  }

  return { cleaned: true, reason: "removed_block" };
}

async function integrateVSCode(bindings, options = {}) {
  const settingsPath = getVSCodeSettingsPath();
  await ensureDirForFile(settingsPath);

  const existing = await readJsonFile(settingsPath, {});
  const warnings = [];
  const sectionsModified = [];
  let setLeader = false;

  const leader = options.leader ? leaderToVSCodeFormat(options.leader) : null;
  const vimrcPath = "~/.config/nvim-keymap-migrator/.vimrc";
  let setVimrcPath = false;

  if (leader && existing["vim.leader"] === undefined) {
    existing["vim.leader"] = leader;
    setLeader = true;
  } else if (leader && existing["vim.leader"] !== leader) {
    warnings.push(
      `vim.leader already set to "${existing["vim.leader"]}" (ours: "${leader}"), keeping existing`,
    );
  }

  if (existing["vim.vimrc.path"] === undefined) {
    existing["vim.vimrc.path"] = vimrcPath;
    setVimrcPath = true;
  } else if (existing["vim.vimrc.path"] !== vimrcPath) {
    warnings.push(
      `vim.vimrc.path already set to "${existing["vim.vimrc.path"]}" (ours: "${vimrcPath}"), keeping existing`,
    );
  }

  let setVimrcEnable = false;
  if (existing["vim.vimrc.enable"] === undefined) {
    existing["vim.vimrc.enable"] = true;
    setVimrcEnable = true;
  } else if (existing["vim.vimrc.enable"] !== true) {
    warnings.push(
      `vim.vimrc.enable is "${existing["vim.vimrc.enable"]}" (expected true), keeping existing`,
    );
  }

  for (const section of VIM_KEYBINDING_SECTIONS) {
    const newBindings = bindings[section];
    if (!Array.isArray(newBindings) || newBindings.length === 0) {
      continue;
    }

    const existingBindings = Array.isArray(existing[section])
      ? existing[section]
      : [];

    const existingManaged = existingBindings.filter(
      (e) => e._managedBy === MANAGED_BY_MARKER,
    );
    const existingUnmanaged = existingBindings.filter(
      (e) => e._managedBy !== MANAGED_BY_MARKER,
    );

    if (existingManaged.length > 0) {
      warnings.push(
        `${section}: replacing ${existingManaged.length} previously managed binding(s)`,
      );
    }

    existing[section] = [...existingUnmanaged, ...newBindings];
    sectionsModified.push(section);
  }

  await writeJsonAtomic(settingsPath, existing);

  return {
    integrated: true,
    sections: sectionsModified,
    warnings: warnings.length > 0 ? warnings : undefined,
    setLeader,
    setVimrcPath,
    setVimrcEnable,
  };
}

async function cleanVSCode() {
  const settingsPath = getVSCodeSettingsPath();
  const exists = await fileExists(settingsPath);

  if (!exists) {
    return { cleaned: true, reason: "no_file" };
  }

  const existing = await readJsonFile(settingsPath, null);

  if (!existing || typeof existing !== "object") {
    return { cleaned: false, reason: "invalid_json" };
  }

  let totalRemoved = 0;
  const sectionsCleaned = [];
  let removedLeader = false;
  let removedVimrcPath = false;
  let removedVimrcEnable = false;

  const metadata = await readMetadata();
  if (metadata?.leader_set && existing["vim.leader"] !== undefined) {
    delete existing["vim.leader"];
    removedLeader = true;
  }

  if (metadata?.vimrc_path_set && existing["vim.vimrc.path"] !== undefined) {
    delete existing["vim.vimrc.path"];
    removedVimrcPath = true;
  }

  if (metadata?.vimrc_enable_set && existing["vim.vimrc.enable"] !== undefined) {
    delete existing["vim.vimrc.enable"];
    removedVimrcEnable = true;
  }

  for (const section of VIM_KEYBINDING_SECTIONS) {
    if (!Array.isArray(existing[section])) {
      continue;
    }

    const before = existing[section].length;
    existing[section] = existing[section].filter(
      (entry) => entry._managedBy !== MANAGED_BY_MARKER,
    );
    const after = existing[section].length;

    if (before !== after) {
      totalRemoved += before - after;
      sectionsCleaned.push(section);
    }

    if (existing[section].length === 0) {
      delete existing[section];
    }
  }

  if (totalRemoved === 0 && !removedLeader && !removedVimrcPath && !removedVimrcEnable) {
    return { cleaned: false, reason: "no_managed_bindings" };
  }

  await writeJsonAtomic(settingsPath, existing);

  return {
    cleaned: true,
    reason: "removed_bindings",
    removed: totalRemoved,
    sections: sectionsCleaned.length > 0 ? sectionsCleaned : undefined,
    removedLeader,
    removedVimrcPath,
    removedVimrcEnable,
  };
}

async function saveMetadata(config, counts, options = {}) {
  await ensureNamespaceDir();

  const existing = await readMetadata();

  const metadata = existing
    ? {
        version: 1,
        created_at: existing.created_at,
        updated_at: new Date().toISOString(),
        leader: config.leader ?? "\\",
        leader_set: options.leaderSet ?? existing.leader_set ?? false,
        vimrc_path_set: options.vimrcPathSet ?? existing.vimrc_path_set ?? false,
        vimrc_enable_set: options.vimrcEnableSet ?? existing.vimrc_enable_set ?? false,
        config_path: config.config_path ?? null,
        counts,
      }
    : {
        version: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        leader: config.leader ?? "\\",
        leader_set: options.leaderSet ?? false,
        vimrc_path_set: options.vimrcPathSet ?? false,
        vimrc_enable_set: options.vimrcEnableSet ?? false,
        config_path: config.config_path ?? null,
        counts,
      };

  await writeMetadata(metadata);
}

export {
  integrateIdeaVim,
  cleanIdeaVim,
  integrateVSCode,
  cleanVSCode,
  saveMetadata,
  getIdeaVimrcPath,
  getVSCodeSettingsPath,
};
