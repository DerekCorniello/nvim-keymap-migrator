import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir, platform } from 'node:os';
import { join, dirname } from 'node:path';
import { ensureNamespaceDir, readMetadata, writeMetadata } from './namespace.js';
import { MANAGED_BY_MARKER, VIM_KEYBINDING_SECTIONS } from './generators/vscode.js';
import type {
    CleanIdeaVimResult,
    CleanVSCodeResult,
    ConfigResult,
    IntegrateIdeaVimResult,
    IntegrateVSCodeResult,
    Metadata,
    MigrationCounts,
    SaveOptions,
    VSCodeBindings,
    VSCodeSectionKey,
} from './types.js';

const MARKER_START = '" <<< nvim-keymap-migrator start >>>';
const MARKER_END = '" >>> nvim-keymap-migrator end <<<';

function leaderToVSCodeFormat(leader: string): string {
    if (leader === ' ') return '<space>';
    if (leader === '\t') return '<tab>';
    if (leader === '\\') return '\\';
    if (leader === '\n' || leader === '\r') return '<cr>';
    return leader;
}

function leaderToIdeaVimFormat(leader: string): string {
    if (leader === ' ') return '\\<space>';
    if (leader === '\t') return '\\<tab>';
    if (leader === '\\') return '\\\\';
    if (leader === '\n' || leader === '\r') return '\\<cr>';
    if (leader.includes('<')) {
        return leader.replace(/</g, '\\<');
    }
    return leader;
}

export function getIdeaVimrcPath(): string {
    return join(homedir(), '.ideavimrc');
}

export function getVSCodeSettingsPath(): string {
    const os = platform();

    if (os === 'darwin') {
        return join(homedir(), 'Library/Application Support/Code/User/settings.json');
    }

    const appData = process.env['APPDATA'];
    if (os === 'win32' && appData) {
        return join(appData, 'Code/User/settings.json');
    }

    return join(homedir(), '.config/Code/User/settings.json');
}

async function fileExists(path: string): Promise<boolean> {
    try {
        await access(path);
        return true;
    } catch {
        return false;
    }
}

async function readTextFile(path: string, fallback = ''): Promise<string> {
    try {
        return await readFile(path, 'utf8');
    } catch {
        return fallback;
    }
}

async function readJsonFile<T>(path: string, fallback: T): Promise<T> {
    try {
        const content = await readFile(path, 'utf8');
        return JSON.parse(content) as T;
    } catch {
        return fallback;
    }
}

async function ensureDirForFile(filePath: string): Promise<void> {
    const dir = dirname(filePath);
    if (dir) {
        await mkdir(dir, { recursive: true });
    }
}

async function writeJsonAtomic(path: string, data: unknown): Promise<void> {
    const dir = dirname(path);
    const tempPath = join(dir, `.nkm-temp-${Date.now()}.json`);
    await writeFile(tempPath, JSON.stringify(data, null, 2), 'utf8');
    await rename(tempPath, path);
}

function extractManagedBlock(content: string): {
    before: string;
    block: string | null;
    after: string;
} {
    const startIdx = content.indexOf(MARKER_START);
    const endIdx = content.indexOf(MARKER_END);

    if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
        return { before: content, block: null, after: '' };
    }

    return {
        before: content.slice(0, startIdx),
        block: content.slice(startIdx, endIdx + MARKER_END.length),
        after: content.slice(endIdx + MARKER_END.length),
    };
}

function buildManagedBlock(mappings: string, leader?: string | null): string {
    const leaderLine = leader ? `let mapleader = "${leaderToIdeaVimFormat(leader)}"` : '';
    const leaderSection = leaderLine ? `${leaderLine}\n\n` : '';

    return `${MARKER_START}
" Managed by nvim-keymap-migrator. Run with --clean to remove.
${leaderSection}${mappings}
${MARKER_END}`;
}

export async function integrateIdeaVim(
    mappings: string,
    options: { leader?: string | null } = {}
): Promise<IntegrateIdeaVimResult> {
    const vimrcPath = getIdeaVimrcPath();
    const content = await readTextFile(vimrcPath, '');
    const { before, block, after } = extractManagedBlock(content);
    const managedBlock = buildManagedBlock(mappings, options.leader);

    if (block) {
        await writeFile(vimrcPath, before + managedBlock + after, 'utf8');
        return { integrated: true, updated: true };
    }

    const newContent = content.trim()
        ? `${content.trim()}\n\n${managedBlock}\n`
        : `${managedBlock}\n`;
    await writeFile(vimrcPath, newContent, 'utf8');
    return { integrated: true, updated: false };
}

export async function cleanIdeaVim(): Promise<CleanIdeaVimResult> {
    const vimrcPath = getIdeaVimrcPath();
    const exists = await fileExists(vimrcPath);

    if (!exists) {
        return { cleaned: true, reason: 'no_file' };
    }

    const content = await readTextFile(vimrcPath, '');
    const { before, block, after } = extractManagedBlock(content);

    if (!block) {
        return { cleaned: false, reason: 'no_block' };
    }

    const cleaned = (before + after).trim();
    await writeFile(vimrcPath, cleaned ? `${cleaned}\n` : '', 'utf8');
    return { cleaned: true, reason: 'removed_block' };
}

export async function integrateVSCode(
    bindings: VSCodeBindings,
    options: { leader?: string | null } = {}
): Promise<IntegrateVSCodeResult> {
    const settingsPath = getVSCodeSettingsPath();
    await ensureDirForFile(settingsPath);

    const existing = await readJsonFile<Record<string, unknown>>(settingsPath, {});
    const warnings: string[] = [];
    const sectionsModified: VSCodeSectionKey[] = [];
    let setLeader = false;

    const leader = options.leader ? leaderToVSCodeFormat(options.leader) : null;
    const vimrcPath = '~/.config/nvim-keymap-migrator/.vimrc';
    let setVimrcPath = false;

    if (leader && existing['vim.leader'] === undefined) {
        existing['vim.leader'] = leader;
        setLeader = true;
    } else if (leader && existing['vim.leader'] !== leader) {
        warnings.push(
            `vim.leader already set to "${String(existing['vim.leader'])}" (ours: "${leader}"), keeping existing`
        );
    }

    if (existing['vim.vimrc.path'] === undefined) {
        existing['vim.vimrc.path'] = vimrcPath;
        setVimrcPath = true;
    } else if (existing['vim.vimrc.path'] !== vimrcPath) {
        warnings.push(
            `vim.vimrc.path already set to "${String(existing['vim.vimrc.path'])}" (ours: "${vimrcPath}"), keeping existing`
        );
    }

    let setVimrcEnable = false;
    if (existing['vim.vimrc.enable'] === undefined) {
        existing['vim.vimrc.enable'] = true;
        setVimrcEnable = true;
    } else if (existing['vim.vimrc.enable'] !== true) {
        warnings.push(
            `vim.vimrc.enable is "${String(existing['vim.vimrc.enable'])}" (expected true), keeping existing`
        );
    }

    for (const section of VIM_KEYBINDING_SECTIONS) {
        const newBindings = bindings[section];
        if (!Array.isArray(newBindings) || newBindings.length === 0) {
            continue;
        }

        const existingBindings = Array.isArray(existing[section]) ? existing[section] : [];
        const existingManaged = existingBindings.filter(
            (entry) =>
                typeof entry === 'object' &&
                entry !== null &&
                !Array.isArray(entry) &&
                (entry as Record<string, unknown>)['_managedBy'] === MANAGED_BY_MARKER
        );
        const existingUnmanaged = existingBindings.filter(
            (entry) =>
                typeof entry !== 'object' ||
                entry === null ||
                Array.isArray(entry) ||
                (entry as Record<string, unknown>)['_managedBy'] !== MANAGED_BY_MARKER
        );

        if (existingManaged.length > 0) {
            warnings.push(
                `${section}: replacing ${existingManaged.length} previously managed binding(s)`
            );
        }

        existing[section] = [...existingUnmanaged, ...newBindings];
        sectionsModified.push(section);
    }

    await writeJsonAtomic(settingsPath, existing);

    return {
        integrated: true,
        sections: sectionsModified,
        ...(warnings.length > 0 ? { warnings } : {}),
        setLeader,
        setVimrcPath,
        setVimrcEnable,
    };
}

export async function cleanVSCode(): Promise<CleanVSCodeResult> {
    const settingsPath = getVSCodeSettingsPath();
    const exists = await fileExists(settingsPath);

    if (!exists) {
        return { cleaned: true, reason: 'no_file' };
    }

    const existing = await readJsonFile<Record<string, unknown> | null>(settingsPath, null);
    if (!existing || typeof existing !== 'object' || Array.isArray(existing)) {
        return { cleaned: false, reason: 'invalid_json' };
    }

    let totalRemoved = 0;
    const sectionsCleaned: VSCodeSectionKey[] = [];
    let removedLeader = false;
    let removedVimrcPath = false;
    let removedVimrcEnable = false;

    const metadata = await readMetadata();
    if (metadata?.leader_set && existing['vim.leader'] !== undefined) {
        delete existing['vim.leader'];
        removedLeader = true;
    }

    if (metadata?.vimrc_path_set && existing['vim.vimrc.path'] !== undefined) {
        delete existing['vim.vimrc.path'];
        removedVimrcPath = true;
    }

    if (metadata?.vimrc_enable_set && existing['vim.vimrc.enable'] !== undefined) {
        delete existing['vim.vimrc.enable'];
        removedVimrcEnable = true;
    }

    for (const section of VIM_KEYBINDING_SECTIONS) {
        if (!Array.isArray(existing[section])) {
            continue;
        }

        const entries = existing[section] as unknown[];
        const filtered = entries.filter(
            (entry) =>
                typeof entry !== 'object' ||
                entry === null ||
                Array.isArray(entry) ||
                (entry as Record<string, unknown>)['_managedBy'] !== MANAGED_BY_MARKER
        );

        if (entries.length !== filtered.length) {
            totalRemoved += entries.length - filtered.length;
            sectionsCleaned.push(section);
        }

        if (filtered.length > 0) {
            existing[section] = filtered;
        } else {
            delete existing[section];
        }
    }

    if (totalRemoved === 0 && !removedLeader && !removedVimrcPath && !removedVimrcEnable) {
        return { cleaned: false, reason: 'no_managed_bindings' };
    }

    await writeJsonAtomic(settingsPath, existing);
    return {
        cleaned: true,
        reason: 'removed_bindings',
        removed: totalRemoved,
        ...(sectionsCleaned.length > 0 ? { sections: sectionsCleaned } : {}),
        removedLeader,
        removedVimrcPath,
        removedVimrcEnable,
    };
}

export async function saveMetadata(
    config: ConfigResult,
    counts: MigrationCounts,
    options: SaveOptions = {}
): Promise<void> {
    await ensureNamespaceDir();

    const existing = await readMetadata();
    const now = new Date().toISOString();

    const metadata: Metadata = existing
        ? {
              version: 1,
              created_at: existing.created_at,
              updated_at: now,
              leader: config.leader ?? '\\',
              leader_set: options.leaderSet ?? existing.leader_set ?? false,
              vimrc_path_set: options.vimrcPathSet ?? existing.vimrc_path_set ?? false,
              vimrc_enable_set: options.vimrcEnableSet ?? existing.vimrc_enable_set ?? false,
              config_path: config.config_path ?? null,
              counts,
          }
        : {
              version: 1,
              created_at: now,
              updated_at: now,
              leader: config.leader ?? '\\',
              leader_set: options.leaderSet ?? false,
              vimrc_path_set: options.vimrcPathSet ?? false,
              vimrc_enable_set: options.vimrcEnableSet ?? false,
              config_path: config.config_path ?? null,
              counts,
          };

    await writeMetadata(metadata);
}
