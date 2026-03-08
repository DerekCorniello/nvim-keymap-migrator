import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IntentId, KeymapMode } from './types.js';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const TEMPLATES_DIR = join(ROOT, 'templates');

export const MODE_TO_MAP: Record<KeymapMode, { noremap: string; map: string }> = {
    n: { noremap: 'nnoremap', map: 'nmap' },
    i: { noremap: 'inoremap', map: 'imap' },
    v: { noremap: 'vnoremap', map: 'vmap' },
    x: { noremap: 'xnoremap', map: 'xmap' },
    s: { noremap: 'snoremap', map: 'smap' },
    o: { noremap: 'onoremap', map: 'omap' },
    c: { noremap: 'cnoremap', map: 'cmap' },
    t: { noremap: 'tnoremap', map: 'tmap' },
};

export interface DefaultKeymap {
    lhs: string;
    mode: KeymapMode;
    intent: IntentId;
}

export interface DefaultsFile {
    keymaps: DefaultKeymap[];
}

export function truthy(value: unknown): boolean {
    return value === true || value === 1;
}

export function readString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function isKeymapMode(value: unknown): value is KeymapMode {
    return typeof value === 'string' && value in MODE_TO_MAP;
}

function isDefaultKeymap(value: unknown): value is DefaultKeymap {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return false;
    }

    const record = value as Record<string, unknown>;
    return (
        typeof record['lhs'] === 'string' &&
        isKeymapMode(record['mode']) &&
        typeof record['intent'] === 'string' &&
        record['intent'].includes('.')
    );
}

export function loadDefaults(): DefaultsFile {
    try {
        const raw = readFileSync(join(TEMPLATES_DIR, 'defaults.json'), 'utf8');
        const parsed: unknown = JSON.parse(raw);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
            return { keymaps: [] };
        }

        const keymaps = (parsed as { keymaps?: unknown }).keymaps;
        return {
            keymaps: Array.isArray(keymaps) ? keymaps.filter(isDefaultKeymap) : [],
        };
    } catch {
        return { keymaps: [] };
    }
}
