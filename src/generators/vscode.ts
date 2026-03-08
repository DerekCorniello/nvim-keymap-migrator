import { loadMappings, lookupIntent } from '../registry.js';
import { loadDefaults, readString } from '../utils.js';
import type {
    DetectedIntent,
    IntentId,
    KeymapMode,
    Registry,
    VSCodeBindings,
    VSCodeSectionKey,
} from '../types.js';
import { isString } from '../validators/common.js';

/** Identifier placed on generated VS Code keybindings to mark them as
 * managed by this tool. Used when cleaning or merging settings.
 */
export const MANAGED_BY_MARKER = 'nvim-keymap-migrator';
type ModeKey = Extract<KeymapMode, 'n' | 'v' | 'x' | 's' | 'i'>;
type BindingSections = Record<VSCodeSectionKey, VSCodeBindings[VSCodeSectionKey]>;

const MODE_TO_SECTION: Record<ModeKey, VSCodeSectionKey> = {
    n: 'vim.normalModeKeyBindings',
    v: 'vim.visualModeKeyBindings',
    x: 'vim.visualModeKeyBindings',
    s: 'vim.visualModeKeyBindings',
    i: 'vim.insertModeKeyBindings',
};
/** List of VS Code settings keys this generator populates. Exported
 * for callers that need to inspect or clean managed sections.
 */
export const VIM_KEYBINDING_SECTIONS = [
    'vim.normalModeKeyBindings',
    'vim.visualModeKeyBindings',
    'vim.insertModeKeyBindings',
] as const satisfies readonly VSCodeSectionKey[];

function asIntentId(value: string | null): IntentId | null {
    return value && value.includes('.') ? (value as IntentId) : null;
}
/**
 * Generate VS Code keybindings for the provided detected intents.
 *
 * The function is conservative: it uses the registry to map detected
 * intents to specific VS Code commands and skips intents that cannot
 * be translated or tokenized. Generated entries are tagged with the
 * managed marker so they can be identified by install/clean routines.
 *
 * @param keymaps - normalized detected intents
 * @param options.registry - optional registry override for testing
 * @returns a VSCodeBindings object suitable for writing into
 *          VS Code settings.json (under the vim.* keys)
 */
export function generateVSCodeBindings(
    keymaps: DetectedIntent[] = [],
    options: { registry?: Registry } = {}
): VSCodeBindings {
    const registry = options.registry ?? loadMappings();
    const defaults = loadDefaults();
    const defaultKeymaps = defaults.keymaps;
    let defaultsAdded = 0;
    const sections: BindingSections = {
        'vim.normalModeKeyBindings': [],
        'vim.visualModeKeyBindings': [],
        'vim.insertModeKeyBindings': [],
    };
    const userBindings = new Set();
    for (const keymap of keymaps) {
        const intent = asIntentId(readString(keymap.intent));
        if (intent) {
            const mode = normalizeMode(keymap.mode);
            const lhs = readString(keymap.lhs);
            if (mode && lhs) {
                userBindings.add(`${mode}|${lhs}`);
            }
        }
    }
    for (const def of defaultKeymaps) {
        const mode = normalizeMode(def.mode);
        const lhs = readString(def.lhs);
        if (!mode || !lhs) continue;
        if (userBindings.has(`${mode}|${lhs}`)) {
            continue;
        }
        const intent = asIntentId(readString(def.intent));
        const command = lookupIntent(intent, 'vscode', registry);
        if (!command) continue;
        const before = toBeforeTokens(lhs);
        if (before.length === 0) continue;
        const section = MODE_TO_SECTION[mode as ModeKey];
        sections[section].push({
            before,
            commands: [command],
            _managedBy: MANAGED_BY_MARKER,
        });
        defaultsAdded += 1;
    }
    const seen = new Set();
    const manual: Array<{ lhs: string; intent: string }> = [];
    for (const keymap of keymaps) {
        const intent = asIntentId(readString(keymap.intent));
        const lhs = readString(keymap.lhs);
        const mode = normalizeMode(keymap.mode);
        if (!intent || !lhs || !mode) {
            continue;
        }
        const command = lookupIntent(intent, 'vscode', registry);
        if (!command) {
            manual.push({ lhs, intent });
            continue;
        }
        const before = toBeforeTokens(lhs);
        if (before.length === 0) {
            manual.push({ lhs, intent });
            continue;
        }
        const section = MODE_TO_SECTION[mode as ModeKey];
        const entryKey = `${section}|${before.join(',')}|${command}`;
        if (seen.has(entryKey)) {
            continue;
        }
        seen.add(entryKey);
        sections[section].push({
            before,
            commands: [command],
            _managedBy: MANAGED_BY_MARKER,
        });
    }
    return {
        ...sections,
        _meta: {
            generated: Object.values(sections).reduce((sum, list) => sum + list.length, 0),
            defaultsAdded,
            manual: manual.length,
            manual_examples: manual.slice(0, 20),
        },
    };
}
function normalizeMode(mode: unknown): ModeKey | null {
    if (!isString(mode)) return null;
    const m = mode as ModeKey;
    return MODE_TO_SECTION[m] ? m : null;
}
function toBeforeTokens(lhs: string): string[] {
    const tokens: string[] = [];
    let i = 0;
    while (i < lhs.length) {
        const ch: string = lhs.charAt(i);
        if (ch === '<') {
            const end = lhs.indexOf('>', i + 1);
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
function mapSpecialToken(token: string): string | null {
    const raw = token.toLowerCase();
    if (raw === 'leader') return '<leader>';
    if (raw === 'cr' || raw === 'enter' || raw === 'return') return 'enter';
    if (raw === 'esc' || raw === 'escape') return 'escape';
    if (raw === 'tab') return 'tab';
    if (raw === 'space') return '<space>';
    if (raw === 'bs' || raw === 'backspace') return 'backspace';
    if (raw === 'lt') return '<';
    const ctrl = raw.match(/^c-(.)$/);
    if (ctrl) return `ctrl+${ctrl[1]}`;
    const shift = raw.match(/^s-(.)$/);
    if (shift) return `shift+${shift[1]}`;
    const alt = raw.match(/^a-(.)$/);
    if (alt) return `alt+${alt[1]}`;
    return raw;
}
