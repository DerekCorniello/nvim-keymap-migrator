import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { Metadata } from './types.js';

const NAMESPACE_DIR = '.config/nvim-keymap-migrator';
const METADATA_FILE = 'metadata.json';

export function getNamespaceDir(): string {
    return join(homedir(), NAMESPACE_DIR);
}

export function getMetadataPath(): string {
    return join(getNamespaceDir(), METADATA_FILE);
}

export function getRcPath(editor: string): string {
    if (editor === 'neovim') {
        return join(getNamespaceDir(), '.vimrc');
    }

    return join(getNamespaceDir(), `${editor}.rc`);
}

export async function ensureNamespaceDir(): Promise<string> {
    const dir = getNamespaceDir();
    await mkdir(dir, { recursive: true });
    return dir;
}

export async function readMetadata(): Promise<Metadata | null> {
    const path = getMetadataPath();
    try {
        await access(path);
        const content = await readFile(path, 'utf8');
        return JSON.parse(content) as Metadata;
    } catch {
        return null;
    }
}

export async function writeMetadata(data: Metadata): Promise<void> {
    await ensureNamespaceDir();
    const path = getMetadataPath();
    await writeFile(path, JSON.stringify(data, null, 2), 'utf8');
}

export async function namespaceExists(): Promise<boolean> {
    try {
        await access(getNamespaceDir());
        return true;
    } catch {
        return false;
    }
}
