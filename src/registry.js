import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TEMPLATE_DIR = join(ROOT, 'templates');

function readJson(name) {
  const raw = readFileSync(join(TEMPLATE_DIR, name), 'utf8');
  return JSON.parse(raw);
}

export function loadMappings() {
  return {
    mappings: {
      ...readJson('lsp-mappings.json'),
      ...readJson('git-mappings.json'),
      ...readJson('navigation-mappings.json'),
      ...readJson('editing-mappings.json')
    },
    aliases: readJson('aliases.json')
  };
}

export function lookupIntent(intent, editor, registry = loadMappings()) {
  const normalized = registry.aliases[intent] ?? intent;
  return registry.mappings[normalized]?.[editor] ?? null;
}
