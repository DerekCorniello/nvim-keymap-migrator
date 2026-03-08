export type EditorTarget = 'vscode' | 'intellij';

export type KeymapMode = 'n' | 'i' | 'v' | 'x' | 'o' | 'c' | 't' | 's';

export type VSCodeSectionKey =
    | 'vim.normalModeKeyBindings'
    | 'vim.visualModeKeyBindings'
    | 'vim.insertModeKeyBindings';

export type IntentId = `${string}.${string}`;

export type DetectionConfidence = 'high' | 'medium' | 'low';

export type DetectionCategory = 'plugin' | 'lsp' | 'git' | 'navigation' | 'editing' | 'unknown';

export interface KeymapOptions {
    silent?: boolean;
    noremap?: boolean;
    buffer?: boolean;
    nowait?: boolean;
    expr?: boolean;
}

export interface RawKeymap extends KeymapOptions {
    lhs?: string | null;
    rhs?: unknown;
    mode?: KeymapMode | string | null;
    desc?: string | null;
    script?: string | null;
    callback?: unknown;
    origin?: string | null;
    buffer_local?: boolean;
    intent?: string | null;
    category?: string | null;
    rhs_type?: string | null;
    rhs_source?: string | null;
    rhs_what?: string | null;
    rhs_name?: string | null;
    rhs_line?: number | null;
    callback_source?: string | null;
    [key: string]: unknown;
}

export interface ExtractionMeta {
    leader?: string | null;
    mapleader_set?: boolean;
    config_path?: string | null;
    source_ok?: boolean | null;
    fallback_from?: string | null;
    fallback_reason?: string | null;
    extraction_mode?: string | null;
    [key: string]: string | number | boolean | null | undefined;
}

export interface ExtractionResult extends Array<RawKeymap> {
    _meta?: ExtractionMeta;
    _warnings?: string[];
}

export interface ExtractionPayload {
    keymaps: RawKeymap[];
    _meta?: ExtractionMeta;
    _warnings?: string[];
}

export interface ConfigResult {
    leader: string | null;
    mapleader_set: boolean;
    maplocalleader: string | null;
    config_path: string | null;
    source_ok: boolean | null;
    mode: 'runtime' | 'strict' | 'unknown';
    fallback_from?: string | null;
    fallback_reason?: string | null;
    warnings: string[];
}

export interface ConfigPayload {
    leader?: string | null;
    mapleader_set?: boolean;
    maplocalleader?: string | null;
    config_path?: string | null;
    source_ok?: boolean | null;
    mode?: 'runtime' | 'strict' | 'unknown';
    warnings?: unknown;
    fallback_from?: string | null;
    fallback_reason?: string | null;
}

export interface DetectedIntent {
    mode: KeymapMode;
    lhs: string;
    raw_rhs: string;
    intent: IntentId | null;
    confidence: DetectionConfidence;
    translatable: boolean;
    desc: string | null;
    category: DetectionCategory;
    opts: Required<KeymapOptions>;
}

export interface MappingTargets {
    vscode?: string;
    intellij?: string;
}

export interface Registry {
    mappings: Partial<Record<IntentId, MappingTargets>>;
    aliases: Record<string, IntentId>;
}

export interface VSCodeBindingEntry {
    before: string[];
    commands: string[];
    _managedBy?: string;
}

export interface ManualExample {
    lhs: string;
    intent: string;
}

export interface VSCodeBindingsMeta {
    generated: number;
    defaultsAdded: number;
    manual: number;
    manual_examples: ManualExample[];
}

export interface VSCodeBindings {
    'vim.normalModeKeyBindings': VSCodeBindingEntry[];
    'vim.visualModeKeyBindings': VSCodeBindingEntry[];
    'vim.insertModeKeyBindings': VSCodeBindingEntry[];
    _meta?: VSCodeBindingsMeta;
}

export interface IntegrateVSCodeResult {
    integrated: boolean;
    setLeader?: boolean;
    setVimrcPath?: boolean;
    setVimrcEnable?: boolean;
    sections?: VSCodeSectionKey[];
    warnings?: string[];
}

export interface SaveOptions {
    leaderSet?: boolean;
    vimrcPathSet?: boolean;
    vimrcEnableSet?: boolean;
}

export interface CleanVSCodeResult {
    cleaned: boolean;
    reason?: string;
    removed?: number;
    sections?: VSCodeSectionKey[];
    removedVimrcPath?: boolean;
    removedVimrcEnable?: boolean;
    removedLeader?: boolean;
}

export interface IdeaVimResult {
    text: string;
    defaultsAdded: number;
}

export interface IntegrateIdeaVimResult {
    integrated: boolean;
    updated: boolean;
}

export interface CleanIdeaVimResult {
    cleaned: boolean;
    reason?: string;
}

export interface ReportItem extends Partial<DetectedIntent> {
    command?: string;
}

export interface ReportOptions {
    target?: EditorTarget | null;
    configPath?: string | null;
    leader?: string | null;
    total?: number;
    translated?: ReportItem[];
    manual?: ReportItem[];
    manualPlugin?: ReportItem[];
    manualOther?: ReportItem[];
    pureVim?: ReportItem[];
    unsupported?: ReportItem[];
    outputs?: string[];
}

export interface MigrationCounts {
    total: number;
    translated: number;
    pureVim: number;
    manual: number;
    unsupported: number;
}

export interface Metadata {
    version: number;
    created_at: string;
    updated_at: string;
    leader: string;
    leader_set: boolean;
    vimrc_path_set: boolean;
    vimrc_enable_set: boolean;
    config_path: string | null;
    counts: MigrationCounts;
}
