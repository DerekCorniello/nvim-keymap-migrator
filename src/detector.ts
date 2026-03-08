import type {
    DetectionCategory,
    DetectionConfidence,
    DetectedIntent,
    ExtractionResult,
    IntentId,
    KeymapMode,
    KeymapOptions,
    RawKeymap,
} from './types.js';
import { MODE_TO_MAP } from './utils.js';

const COMMAND_INTENTS: Array<{ pattern: RegExp; intent: IntentId }> = [
    { pattern: /^:?Ex!?$/, intent: 'navigation.file_explorer' },
    { pattern: /^:?Git!?$/, intent: 'git.fugitive' },
    { pattern: /^:?G!?$/, intent: 'git.fugitive' },
    { pattern: /^:?NvimTreeToggle!?$/, intent: 'plugin.nvim_tree' },
];

const RAW_PATTERN_INTENTS: Array<{ pattern: RegExp; intent: IntentId }> = [
    { pattern: /vim\.lsp\.buf\.definition/, intent: 'lsp.definition' },
    { pattern: /vim\.lsp\.buf\.declaration/, intent: 'lsp.declaration' },
    { pattern: /vim\.lsp\.buf\.implementation/, intent: 'lsp.implementation' },
    { pattern: /vim\.lsp\.buf\.references/, intent: 'lsp.references' },
    { pattern: /vim\.lsp\.buf\.hover/, intent: 'lsp.hover' },
    { pattern: /vim\.lsp\.buf\.rename/, intent: 'lsp.rename' },
    { pattern: /vim\.lsp\.buf\.code_action/, intent: 'lsp.code_action' },
    { pattern: /vim\.lsp\.buf\.format/, intent: 'lsp.format' },
    { pattern: /vim\.lsp\.buf\.signature_help/, intent: 'lsp.signature_help' },
    { pattern: /vim\.lsp\.buf\.type_definition/, intent: 'lsp.type_definition' },
    { pattern: /vim\.lsp\.buf\.add_workspace_folder/, intent: 'lsp.add_workspace_folder' },
    {
        pattern: /vim\.lsp\.buf\.remove_workspace_folder/,
        intent: 'lsp.remove_workspace_folder',
    },
    { pattern: /vim\.diagnostic\.goto_next/, intent: 'lsp.diagnostic_next' },
    { pattern: /vim\.diagnostic\.goto_prev/, intent: 'lsp.diagnostic_prev' },
    { pattern: /vim\.diagnostic\.setloclist/, intent: 'lsp.diagnostic_setloclist' },
    {
        pattern: /vim\.cmd\.Git\b(?!.*\b(push|pull|commit|add|status|blame)\b)/,
        intent: 'git.fugitive',
    },
    { pattern: /vim\.cmd\.Git.*\bpush\b/i, intent: 'git.push' },
    { pattern: /vim\.cmd\.Git.*\bpull\b/i, intent: 'git.pull' },
    { pattern: /vim\.cmd\.Git.*\bcommit\b/i, intent: 'git.commit' },
    { pattern: /vim\.cmd\.Git.*\badd\b/i, intent: 'git.add' },
    { pattern: /vim\.cmd\.Git.*\bstatus\b/i, intent: 'git.status' },
    { pattern: /vim\.cmd\.Git.*\bblame\b/i, intent: 'git.blame' },
    { pattern: /telescope\.builtin\.find_files/, intent: 'navigation.find_files' },
    { pattern: /telescope\.builtin\.live_grep/, intent: 'navigation.live_grep' },
    { pattern: /telescope\.builtin\.buffers/, intent: 'navigation.buffers' },
    { pattern: /telescope\.builtin\.oldfiles/, intent: 'navigation.recent_files' },
    { pattern: /telescope\.builtin\.help_tags/, intent: 'navigation.help_tags' },
    { pattern: /telescope\.builtin\.grep_string/, intent: 'navigation.grep_string' },
    {
        pattern: /telescope\.builtin\.current_buffer_fuzzy_find/,
        intent: 'navigation.buffer_search',
    },
    { pattern: /telescope\.builtin\.resume/, intent: 'navigation.resume_search' },
    { pattern: /telescope\.builtin\.diagnostics/, intent: 'navigation.diagnostics' },
    { pattern: /telescope\.builtin\.keymaps/, intent: 'navigation.keymaps' },
    { pattern: /telescope\.builtin\.command_history/, intent: 'navigation.command_history' },
    { pattern: /harpoon:list\(\):add\(\)/, intent: 'harpoon.add' },
    { pattern: /harpoon:list\(\):select\(1\)/, intent: 'harpoon.select_1' },
    { pattern: /harpoon:list\(\):select\(2\)/, intent: 'harpoon.select_2' },
    { pattern: /harpoon:list\(\):select\(3\)/, intent: 'harpoon.select_3' },
    { pattern: /harpoon:list\(\):select\(4\)/, intent: 'harpoon.select_4' },
    { pattern: /harpoon:list\(\):prev\(\)/, intent: 'harpoon.prev' },
    { pattern: /harpoon:list\(\):next\(\)/, intent: 'harpoon.next' },
    { pattern: /harpoon\.ui:toggle_quick_menu/, intent: 'harpoon.menu' },
    { pattern: /todo-comments\.jump_next/, intent: 'todo.next' },
    { pattern: /todo-comments\.jump_prev/, intent: 'todo.prev' },
    { pattern: /vim\.cmd\.Ex\b/, intent: 'navigation.file_explorer' },
];

const DESC_ALIAS: Record<string, IntentId> = {
    find_files: 'navigation.find_files',
    switch_buffer: 'navigation.buffers',
    buffers: 'navigation.buffers',
    recent_files: 'navigation.recent_files',
    live_grep: 'navigation.live_grep',
    grep_string: 'navigation.grep_string',
    go_to_definition: 'lsp.definition',
    find_references: 'lsp.references',
    hover: 'lsp.hover',
    rename: 'lsp.rename',
    code_action: 'lsp.code_action',
    quick_fix: 'lsp.code_action',
    format: 'editing.format',
};

interface DetectIntentResult {
    intent: IntentId | null;
    confidence: DetectionConfidence;
    translatable: boolean;
    category: DetectionCategory;
}

function normalizeMode(mode: unknown): KeymapMode {
    return typeof mode === 'string' && mode in MODE_TO_MAP ? (mode as KeymapMode) : 'n';
}

function normalizeOptions(keymap: RawKeymap): Required<KeymapOptions> {
    return {
        silent: keymap.silent ?? false,
        noremap: keymap.noremap ?? false,
        buffer: keymap.buffer ?? false,
        nowait: keymap.nowait ?? false,
        expr: keymap.expr ?? false,
    };
}

function detectCommandIntent(rhs: string): IntentId | null {
    if (!rhs) return null;
    const match = rhs.match(/<cmd>\s*([^<\r\n]+)\s*<CR>/i) || rhs.match(/:\s*([^<\r\n]+)\s*<CR>/i);
    if (!match?.[1]) return null;

    const command = match[1].trim();
    for (const item of COMMAND_INTENTS) {
        if (item.pattern.test(command)) {
            return item.intent;
        }
    }
    return null;
}

function detectPatternIntent(rawText: string): IntentId | null {
    if (!rawText) return null;
    for (const item of RAW_PATTERN_INTENTS) {
        if (item.pattern.test(rawText)) {
            return item.intent;
        }
    }
    return null;
}

function normalizeLabel(input: string): string {
    return input
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .replace(/_+/g, '_');
}

function detectFuzzyDescIntent(desc: string): IntentId | null {
    const text = desc.toLowerCase().trim();
    if (!text) return null;

    const rules: Array<{ pattern: RegExp; intent: IntentId }> = [
        { pattern: /\b(find files?|file find)\b/, intent: 'navigation.find_files' },
        { pattern: /\b(switch buffer|buffer list|buffers)\b/, intent: 'navigation.buffers' },
        { pattern: /\b(recent files?)\b/, intent: 'navigation.recent_files' },
        { pattern: /\b(live grep|grep \(root dir\)|grep)\b/, intent: 'navigation.live_grep' },
        { pattern: /\b(search buffer|buffer search)\b/, intent: 'navigation.buffer_search' },
        { pattern: /\b(help pages?|help tags?)\b/, intent: 'navigation.help_tags' },
        { pattern: /\b(key maps?|keymaps?)\b/, intent: 'navigation.keymaps' },
        { pattern: /\b(command history)\b/, intent: 'navigation.command_history' },
        { pattern: /\b(word under cursor|grep string)\b/, intent: 'navigation.grep_string' },
        {
            pattern: /\b(document diagnostics?|workspace diagnostics?|diagnostics?)\b/,
            intent: 'navigation.diagnostics',
        },
        { pattern: /\b(resume( last)? search)\b/, intent: 'navigation.resume_search' },
        { pattern: /\b(next todo comment|todo next)\b/, intent: 'todo.next' },
        {
            pattern: /\b(previous todo comment|todo prev|todo previous)\b/,
            intent: 'todo.prev',
        },
        { pattern: /\b(go to definition|goto definition)\b/, intent: 'lsp.definition' },
        { pattern: /\b(find references|go to references)\b/, intent: 'lsp.references' },
        { pattern: /^(hover|show hover|lsp hover)$/, intent: 'lsp.hover' },
        { pattern: /^(rename|rename symbol|lsp rename)$/, intent: 'lsp.rename' },
        { pattern: /^(code action|quick fix|lsp code action)$/, intent: 'lsp.code_action' },
        { pattern: /^(format|format document|lsp format)$/, intent: 'editing.format' },
    ];

    for (const rule of rules) {
        if (rule.pattern.test(text)) {
            return rule.intent;
        }
    }

    return null;
}

function detectDescIntent(desc: string): IntentId | null {
    if (!desc) return null;
    const direct = DESC_ALIAS[normalizeLabel(desc)];
    if (direct) {
        return direct;
    }
    return detectFuzzyDescIntent(desc);
}

function isTodoDesc(desc: string): boolean {
    const lower = desc.toLowerCase();
    return lower.includes('todo') || lower.includes('comment');
}

function detectCoreKeymapsByLhs(lhs: string): IntentId | null {
    const table: Record<string, IntentId> = {
        '<leader>pv': 'navigation.file_explorer',
        '<leader>G': 'git.fugitive',
        '<leader>gp': 'git.push',
        '<leader>gP': 'git.pull',
        '<leader>gac': 'git.add',
        '<leader>gc': 'git.commit',
        '<leader>gs': 'git.status',
        ']t': 'todo.next',
        '[t': 'todo.prev',
    };
    return table[lhs] ?? null;
}

function detectHarpoonByLhs(lhs: string): IntentId | null {
    const table: Record<string, IntentId> = {
        '<leader>a': 'harpoon.add',
        '<leader>m': 'harpoon.menu',
        '<C-h>': 'harpoon.select_1',
        '<C-j>': 'harpoon.select_2',
        '<C-k>': 'harpoon.select_3',
        '<C-l>': 'harpoon.select_4',
        '<C-a>': 'harpoon.prev',
        '<C-s>': 'harpoon.next',
    };
    return table[lhs] ?? null;
}

function detectSourceIntent(input: {
    lhs: string;
    rhsSource: string;
    desc: string;
}): IntentId | null {
    const source = input.rhsSource.toLowerCase();
    const key = input.lhs;

    const commonKeymaps: Record<string, IntentId> = {
        '<leader>pv': 'navigation.file_explorer',
        '<leader>G': 'git.fugitive',
        '<leader>gp': 'git.push',
        '<leader>gP': 'git.pull',
        '<leader>gac': 'git.add',
        '<leader>gc': 'git.commit',
        '<leader>gs': 'git.status',
    };

    if (commonKeymaps[key]) {
        return commonKeymaps[key];
    }

    if (source.includes('/core/plugins/harpoon.lua')) {
        return detectHarpoonByLhs(key);
    }

    if (source.includes('/core/keymaps.lua')) {
        return detectCoreKeymapsByLhs(key) ?? detectDescIntent(input.desc);
    }

    if (source.includes('/telescope/builtin/init.lua')) {
        return detectDescIntent(input.desc);
    }

    if (source.includes('/vim/lsp/buf.lua') && key === '<leader>f') {
        return 'lsp.format';
    }

    return null;
}

function categorizeIntent(
    intent: IntentId | null,
    rhsSource: string,
    desc: string
): DetectionCategory {
    if (!intent) {
        return 'unknown';
    }

    if (
        intent.startsWith('harpoon.') ||
        intent.startsWith('todo.') ||
        intent.startsWith('plugin.')
    ) {
        return 'plugin';
    }

    if (intent.startsWith('lsp.')) {
        return 'lsp';
    }

    if (intent.startsWith('git.')) {
        return 'git';
    }

    if (intent.startsWith('navigation.')) {
        if (isTodoDesc(desc) || rhsSource.includes('todo-comments')) {
            return 'plugin';
        }
        return 'navigation';
    }

    if (intent.startsWith('editing.')) {
        return 'editing';
    }

    return 'unknown';
}

function result(
    intent: IntentId | null,
    confidence: DetectionConfidence,
    translatable: boolean,
    category: DetectionCategory = 'unknown'
): DetectIntentResult {
    return { intent, confidence, translatable, category };
}

export function detectIntent(keymap: RawKeymap = {}): DetectIntentResult {
    const rhs = typeof keymap.rhs === 'string' ? keymap.rhs : '';
    const rhsSource = typeof keymap.rhs_source === 'string' ? keymap.rhs_source : '';
    const rhsName = typeof keymap.rhs_name === 'string' ? keymap.rhs_name : '';
    const desc = typeof keymap.desc === 'string' ? keymap.desc : '';
    const lhs = typeof keymap.lhs === 'string' ? keymap.lhs : '';
    const rawText = `${rhs} ${rhsSource} ${rhsName} ${desc}`.trim();

    const commandIntent = detectCommandIntent(rhs);
    if (commandIntent) {
        return result(
            commandIntent,
            'high',
            true,
            categorizeIntent(commandIntent, rhsSource, desc)
        );
    }

    const sourceIntent = detectSourceIntent({ lhs, rhsSource, desc });
    if (sourceIntent) {
        return result(sourceIntent, 'high', true, categorizeIntent(sourceIntent, rhsSource, desc));
    }

    const patternIntent = detectPatternIntent(rawText);
    if (patternIntent) {
        return result(patternIntent, 'high', true);
    }

    const descIntent = detectDescIntent(desc);
    if (descIntent) {
        return result(descIntent, 'medium', true, categorizeIntent(descIntent, rhsSource, desc));
    }

    return result(null, 'low', false, 'unknown');
}

export function detectIntents(keymaps: ExtractionResult | unknown): DetectedIntent[] {
    if (!Array.isArray(keymaps)) {
        return [];
    }

    return keymaps.map((keymap) => {
        const rawKeymap = (keymap ?? {}) as RawKeymap;
        const detected = detectIntent(rawKeymap);
        return {
            mode: normalizeMode(rawKeymap.mode),
            lhs: typeof rawKeymap.lhs === 'string' ? rawKeymap.lhs : '',
            raw_rhs:
                typeof rawKeymap.rhs === 'string' && rawKeymap.rhs.length > 0
                    ? rawKeymap.rhs
                    : '<Lua function>',
            intent: detected.intent,
            confidence: detected.confidence,
            translatable: detected.translatable,
            desc: typeof rawKeymap.desc === 'string' ? rawKeymap.desc : null,
            category: detected.category,
            opts: normalizeOptions(rawKeymap),
        };
    });
}
