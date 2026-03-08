#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { extractKeymaps } from './extractor.js';
import { detectConfig } from './config.js';
import { detectIntents } from './detector.js';
import { loadMappings, lookupIntent } from './registry.js';
import { generateVimrc, isPureVimMapping } from './generators/vimrc.js';
import { generateIdeaVimrc } from './generators/intellij.js';
import { generateVSCodeBindings } from './generators/vscode.js';
import { generateReport } from './report.js';
import { ensureNamespaceDir, getRcPath } from './namespace.js';
import {
    integrateIdeaVim,
    cleanIdeaVim,
    integrateVSCode,
    cleanVSCode,
    saveMetadata,
} from './install.js';
import type {
    ExtractionResult,
    DetectedIntent,
    ConfigResult,
    Registry,
    VSCodeBindings,
    IntegrateVSCodeResult,
    IdeaVimResult,
    EditorTarget,
    MigrationCounts,
    ExtractionMeta,
} from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8'));
const args = process.argv.slice(2);

class FlaggedArgs {
    help: boolean;
    version: boolean;
    dryRun: boolean;
    clean: boolean;
    editor: EditorTarget | null;
    error: string | null;

    constructor() {
        this.help = false;
        this.version = false;
        this.dryRun = false;
        this.clean = false;
        this.editor = null;
        this.error = null;
    }
}

await main(args);

function checkNeovimAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
        const proc = spawn('nvim', ['--version'], { stdio: 'ignore' });
        proc.on('error', () => resolve(false));
        proc.on('close', (code) => resolve(code === 0));
    });
}
async function main(argv: string[]) {
    const parsed = parseArgs(argv);
    if (parsed.error) {
        printHelp(parsed.error);
        process.exitCode = 1;
        return;
    }
    if (parsed.help) {
        printHelp();
        return;
    }
    if (parsed.version) {
        console.log(pkg.version);
        return;
    }
    if (!parsed.editor) {
        printHelp('Missing required <editor>. Use "vscode" or "intellij".');
        process.exitCode = 1;
        return;
    }
    if (!['vscode', 'intellij'].includes(parsed.editor)) {
        printHelp(`Unsupported editor: ${parsed.editor}`);
        process.exitCode = 1;
        return;
    }
    if (parsed.clean) {
        await handleClean(parsed.editor);
        return;
    }
    await handleGenerate(parsed);
}
async function handleGenerate(parsed: {
    dryRun: boolean;
    editor: EditorTarget | null;
}): Promise<void> {
    try {
        if (!parsed.editor) {
            throw new Error('Missing editor target');
        }
        const nvimAvailable = await checkNeovimAvailable();
        if (!nvimAvailable) {
            console.error('Error: Neovim not found. Please install Neovim 0.8+');
            process.exitCode = 1;
            return;
        }
        const extracted: ExtractionResult = await extractKeymaps();
        const config: ConfigResult = await resolveConfig(extracted);
        const intents: DetectedIntent[] = detectIntents(extracted);
        const registry: Registry = loadMappings();
        if (intents.length === 0) {
            console.log(`No user-defined keymaps found in your Neovim config.
Nothing to write.`);
            return;
        }
        const translated: Array<DetectedIntent & { command: string }> = [];
        const manual: DetectedIntent[] = [];
        const unsupported: DetectedIntent[] = [];
        for (const item of intents) {
            if (!item.intent) {
                unsupported.push(item);
                continue;
            }
            const command = lookupIntent(item.intent, parsed.editor, registry);
            if (!command) {
                manual.push(item);
                continue;
            }
            translated.push({ ...item, command });
        }
        const vimrcText = generateVimrc(intents);
        const pureVim = intents.filter(isPureVimMapping);
        const counts: MigrationCounts = {
            total: intents.length,
            translated: translated.length,
            pureVim: pureVim.length,
            manual: manual.length,
            unsupported: unsupported.length,
        };
        const leaderLabel = formatKeyDisplay(config.leader);
        if (parsed.dryRun) {
            const report = generateReport({
                target: parsed.editor,
                configPath: config.config_path,
                leader: leaderLabel,
                total: intents.length,
                translated,
                manual,
                manualPlugin: manual.filter((item) => item.category === 'plugin'),
                manualOther: manual.filter((item) => item.category !== 'plugin'),
                pureVim,
                unsupported: unsupported.filter((item) => !isPureVimMapping(item)),
                outputs: [],
            });
            console.log(report.trimEnd());
            printDetectionWarnings(config, extracted);
            return;
        }
        await ensureNamespaceDir();
        const vimrcPath = getRcPath('neovim');
        await writeFile(vimrcPath, vimrcText, 'utf8');
        console.log(`=== nvim-keymap-migrator ===
Editor: ${parsed.editor}
Config: ${config.config_path}
Leader: ${leaderLabel}

`);
        if (parsed.editor === 'intellij') {
            const ideaVimrcResult: IdeaVimResult = generateIdeaVimrc(intents, {
                registry,
            });
            const ideaVimrcText = ideaVimrcResult.text;
            const ideaDefaults = ideaVimrcResult.defaultsAdded ?? 0;
            const result = await integrateIdeaVim(ideaVimrcText, {
                leader: config.leader,
            });
            await saveMetadata(config, counts);
            console.log(`Shared .vimrc: ${vimrcPath}

IntelliJ:
  Mappings appended to ~/.ideavimrc${result.updated ? '\n  (replaced previous mappings)' : ''}
  Defaults added: ${ideaDefaults}`);
        } else if (parsed.editor === 'vscode') {
            const vscodeBindings: VSCodeBindings = generateVSCodeBindings(intents, {
                registry,
            });
            const result: IntegrateVSCodeResult = await integrateVSCode(vscodeBindings, {
                leader: config.leader,
            });
            const saveOptions = {
                ...(result.setLeader !== undefined ? { leaderSet: result.setLeader } : {}),
                ...(result.setVimrcPath !== undefined ? { vimrcPathSet: result.setVimrcPath } : {}),
                ...(result.setVimrcEnable !== undefined
                    ? { vimrcEnableSet: result.setVimrcEnable }
                    : {}),
            };
            await saveMetadata(config, counts, saveOptions);
            let vscodeOutput = `Shared .vimrc: ${vimrcPath}

VS Code:
  Keybindings merged into settings.json`;
            if (result.setVimrcPath) {
                vscodeOutput += '\n  vim.vimrc.path set in settings.json (reads shared .vimrc)';
            }
            if (result.setVimrcEnable) {
                vscodeOutput += '\n  vim.vimrc.enable set in settings.json (loads shared .vimrc)';
            }
            if (result.setLeader) {
                vscodeOutput += '\n  vim.leader set in settings.json';
            }
            if (result.sections) {
                vscodeOutput += `\n  Sections: ${result.sections.join(', ')}`;
            }
            if (result.warnings) {
                for (const w of result.warnings) {
                    vscodeOutput += `\n  ${w}`;
                }
            }
            const vsDefaults = vscodeBindings._meta?.defaultsAdded ?? 0;
            vscodeOutput += `\n  Defaults added: ${vsDefaults}`;
            console.log(vscodeOutput);
        }
        console.log(`
Total keymaps: ${counts.total}
Translated: ${counts.translated}
Pure Vim: ${counts.pureVim}
Manual review: ${counts.manual}
Unsupported: ${counts.unsupported}`);
        printDetectionWarnings(config, extracted);
    } catch (error) {
        // eslint-disable-next-line no-console
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`Error: ${msg}`);
        process.exitCode = 1;
    }
}

async function resolveConfig(extracted: ExtractionResult): Promise<ConfigResult> {
    const fromExtraction = configFromExtractionMeta(extracted);
    if (
        fromExtraction.leader !== null &&
        fromExtraction.config_path !== null &&
        fromExtraction.mode !== 'unknown'
    ) {
        return fromExtraction;
    }

    return detectConfig().catch((error: unknown) => fallbackConfigFromExtraction(extracted, error));
}

function configFromExtractionMeta(extracted: ExtractionResult): ConfigResult {
    const meta: ExtractionMeta = extracted._meta ?? {};
    return {
        leader: typeof meta.leader === 'string' ? meta.leader : '\\',
        mapleader_set: meta.mapleader_set === true,
        maplocalleader: null,
        config_path: typeof meta.config_path === 'string' ? meta.config_path : null,
        source_ok: typeof meta.source_ok === 'boolean' ? meta.source_ok : null,
        mode:
            meta.extraction_mode === 'runtime' || meta.extraction_mode === 'strict'
                ? meta.extraction_mode
                : 'unknown',
        fallback_from: typeof meta.fallback_from === 'string' ? meta.fallback_from : null,
        fallback_reason: typeof meta.fallback_reason === 'string' ? meta.fallback_reason : null,
        warnings: [],
    };
}

function fallbackConfigFromExtraction(extracted: ExtractionResult, error: unknown): ConfigResult {
    const base = configFromExtractionMeta(extracted);
    const message =
        error instanceof Error && error.message.trim()
            ? error.message.trim()
            : String(error || 'unknown_config_detection_error');

    return {
        ...base,
        fallback_from: 'config_detection',
        fallback_reason: message,
        warnings: [`config_detection_failed: ${message}`],
    };
}
async function handleClean(editor: EditorTarget): Promise<void> {
    try {
        console.log(`=== nvim-keymap-migrator --clean ===
Editor: ${editor}

`);
        if (editor === 'intellij') {
            const result = await cleanIdeaVim();
            if (result.cleaned) {
                console.log('Removed managed mappings from ~/.ideavimrc');
            } else {
                console.log('No managed mappings found in ~/.ideavimrc');
            }
        } else if (editor === 'vscode') {
            const result = await cleanVSCode();
            if (result.cleaned) {
                let output = `Removed ${result.removed} keybinding(s) from settings.json`;
                if (result.sections) {
                    output += `\nSections cleaned: ${result.sections.join(', ')}`;
                }
                if (result.removedVimrcPath) {
                    output += '\nRemoved vim.vimrc.path from settings.json';
                }
                if (result.removedVimrcEnable) {
                    output += '\nRemoved vim.vimrc.enable from settings.json';
                }
                if (result.removedLeader) {
                    output += '\nRemoved vim.leader from settings.json';
                }
                console.log(output);
            } else {
                console.log('No managed keybindings found in settings.json');
            }
        }
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`Error: ${msg}`);
        process.exitCode = 1;
    }
}

function parseArgs(argv: string[]) {
    const flags: FlaggedArgs = new FlaggedArgs();

    const tokens = [...argv];
    for (let i = 0; i < tokens.length; i += 1) {
        const arg = tokens[i];
        if (arg === undefined) continue;
        if (arg === '--help' || arg === '-h' || arg === 'help') {
            flags.help = true;
            continue;
        }
        if (arg === '--version' || arg === '-v' || arg === 'version') {
            flags.version = true;
            continue;
        }
        if (arg === '--dry-run') {
            flags.dryRun = true;
            continue;
        }
        if (arg === '--clean') {
            flags.clean = true;
            continue;
        }
        if (arg === 'run') {
            continue;
        }
        if (!flags.editor && (arg === 'vscode' || arg === 'intellij')) {
            flags.editor = arg;
            continue;
        }
        if (arg.startsWith('-')) {
            flags.error = `Unknown option: ${arg}`;
            return flags;
        }
        flags.error = `Unknown argument: ${arg}`;
        return flags;
    }
    return flags;
}
function printHelp(error: string | null = null) {
    if (error) {
        console.error(error + '\n');
    }
    const help = `Usage: ${pkg.bin['nvim-keymap-migrator']} <editor> [options]

Editors:
  vscode             Generate and integrate keybindings for VS Code
  intellij           Generate and integrate keybindings for IntelliJ

Options:
  --dry-run          Print report without writing files
  --clean            Remove managed keybindings from editor config
  --help, -h         Show help
  --version, -v      Show version

Examples:
  nvim-keymap-migrator vscode        # Integrate with VS Code
  nvim-keymap-migrator intellij      # Integrate with IntelliJ
  nvim-keymap-migrator vscode --dry-run  # Preview without changes
  nvim-keymap-migrator vscode --clean    # Remove VS Code keybindings

Files modified:
  IntelliJ: ~/.ideavimrc
  VS Code:  settings.json (platform-specific path)`;
    console.log(help);
}
function formatKeyDisplay(value: string | null): string {
    if (value == null) return '<none>';
    if (value.length === 0) return '<empty>';
    const special: Record<string, string> = {
        ' ': '<space>',
        '\t': '<Tab>',
        '\n': '<NL>',
        '\r': '<CR>',
        '\u001B': '<Esc>',
    };
    return [...value].map((char: string) => special[char] ?? printableChar(char)).join('');
}
function printableChar(char: string) {
    const code = char.charCodeAt(0);
    if (code < 32) {
        return `<0x${code.toString(16).padStart(2, '0')}>`;
    }
    if (char === '\\') {
        return '\\\\';
    }
    return char;
}
function printDetectionWarnings(config: ConfigResult, extracted: ExtractionResult): void {
    const extractionMeta = extracted?._meta ?? {};
    const extractionWarnings: string[] = Array.isArray(extracted?._warnings)
        ? (extracted._warnings as string[])
        : [];
    if (config.fallback_from) {
        console.warn(
            `Warning: config detection fell back from ${config.fallback_from} to ${config.mode} (${config.fallback_reason})`
        );
    }
    if (Array.isArray(config.warnings) && config.warnings.length > 0) {
        console.warn(`Config warnings (${config.warnings.length}):`);
        for (const warning of config.warnings.slice(0, 5)) {
            console.warn(`- ${warning}`);
        }
    }
    if (extractionMeta['fallback_from']) {
        console.warn(
            `Warning: extraction fell back from ${extractionMeta['fallback_from']} to ${extractionMeta['extraction_mode']} (${extractionMeta['fallback_reason']})`
        );
    }
    if (extractionWarnings.length > 0) {
        console.warn(`Extraction warnings (${extractionWarnings.length}):`);
        for (const warning of extractionWarnings.slice(0, 5)) {
            console.warn(`- ${warning}`);
        }
    }
}
