import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TEMPLATE_DIR = join(ROOT, 'templates');

function readJson(name) {
  try {
    const raw = readFileSync(join(TEMPLATE_DIR, name), 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Failed to load template ${name}: ${error.message}`);
  }
}

export function loadMappings() {
  const aliases = readJson('aliases.json');
  const normalizedAliases = {};
  for (const [key, value] of Object.entries(aliases)) {
    normalizedAliases[normalizeIntentKey(key)] = value;
  }

  return {
    mappings: {
      ...readJson('lsp-mappings.json'),
      ...readJson('git-mappings.json'),
      ...readJson('navigation-mappings.json'),
      ...readJson('editing-mappings.json')
    },
    aliases: normalizedAliases
  };
}

export function lookupIntent(intent, editor, registry = loadMappings()) {
  const key = normalizeIntentKey(intent);
  const normalized = registry.aliases[key] ?? key;
  return registry.mappings[normalized]?.[editor] ?? null;
}

function normalizeIntentKey(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}
