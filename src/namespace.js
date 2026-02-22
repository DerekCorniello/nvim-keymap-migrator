import { mkdir, readFile, writeFile, access, rm } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

const NAMESPACE_DIR = ".config/nvim-keymap-migrator";
const METADATA_FILE = "metadata.json";

function getNamespaceDir() {
  return join(homedir(), NAMESPACE_DIR);
}

function getMetadataPath() {
  return join(getNamespaceDir(), METADATA_FILE);
}

function getRcPath(editor) {
  if (editor === "neovim") {
    return join(getNamespaceDir(), ".vimrc");
  }
  return join(getNamespaceDir(), `${editor}.rc`);
}

async function ensureNamespaceDir() {
  const dir = getNamespaceDir();
  await mkdir(dir, { recursive: true });
  return dir;
}

async function readMetadata() {
  const path = getMetadataPath();
  try {
    await access(path);
    const content = await readFile(path, "utf8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

async function writeMetadata(data) {
  await ensureNamespaceDir();
  const path = getMetadataPath();
  await writeFile(path, JSON.stringify(data, null, 2), "utf8");
}

async function namespaceExists() {
  try {
    await access(getNamespaceDir());
    return true;
  } catch {
    return false;
  }
}

export {
  getNamespaceDir,
  getMetadataPath,
  getRcPath,
  ensureNamespaceDir,
  readMetadata,
  writeMetadata,
  namespaceExists,
};
