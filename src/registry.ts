import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { EditorTarget, IntentId, Registry } from './types.js';
import { TEMPLATES_DIR } from './utils.js';

function readJson(name: string): unknown {
    try {
        const raw = readFileSync(join(TEMPLATES_DIR, name), 'utf8');
        return JSON.parse(raw);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to load template ${name}: ${message}`);
    }
}

function normalizeIntentKey(value: unknown): string {
    if (typeof value !== 'string') {
        return '';
    }

    return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function isMappingTargets(value: unknown): value is Registry['mappings'][IntentId] {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return false;
    }

    const record = value as Record<string, unknown>;
    return Object.entries(record).every(
        ([key, item]) => (key === 'vscode' || key === 'intellij') && typeof item === 'string'
    );
}

function asIntentId(value: string): IntentId {
    return value as IntentId;
}

export function loadMappings(): Registry {
    const aliasesRaw = readJson('aliases.json');
    const normalizedAliases: Record<string, IntentId> = {};

    if (typeof aliasesRaw === 'object' && aliasesRaw !== null && !Array.isArray(aliasesRaw)) {
        for (const [key, value] of Object.entries(aliasesRaw)) {
            if (typeof value === 'string' && value.includes('.')) {
                normalizedAliases[normalizeIntentKey(key)] = asIntentId(value);
            }
        }
    }

    const mappings: Registry['mappings'] = {};
    for (const file of [
        'lsp-mappings.json',
        'git-mappings.json',
        'navigation-mappings.json',
        'editing-mappings.json',
    ]) {
        const raw = readJson(file);
        if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
            continue;
        }

        for (const [intent, targets] of Object.entries(raw)) {
            if (!intent.includes('.') || !isMappingTargets(targets)) {
                continue;
            }
            mappings[asIntentId(intent)] = targets;
        }
    }

    return {
        mappings,
        aliases: normalizedAliases,
    };
}

export function lookupIntent(
    intent: string | null | undefined,
    editor: EditorTarget,
    registry: Registry = loadMappings()
): string | null {
    const key = normalizeIntentKey(intent);
    if (!key) {
        return null;
    }

    const normalized = registry.aliases[key] ?? (key.includes('.') ? asIntentId(key) : null);
    return normalized ? (registry.mappings[normalized]?.[editor] ?? null) : null;
}
