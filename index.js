#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractKeymaps } from './src/extractor.js';
import { detectConfig } from './src/config.js';
import { detectIntents } from './src/detector.js';
import { loadMappings, lookupIntent } from './src/registry.js';
import { generateVimrc } from './src/generators/vimrc.js';
import { generateIdeaVimrc } from './src/generators/intellij.js';
import { generateVSCodeBindings } from './src/generators/vscode.js';
import { generateReport } from './src/report.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const pkg = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf8'));
const args = process.argv.slice(2);

await main(args);

async function main(argv) {
  const parsed = parseArgs(argv);

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

  try {
    const config = await detectConfig();
    const extracted = await extractKeymaps();
    const intents = detectIntents(extracted);
    const registry = loadMappings();

    const translated = [];
    const manual = [];
    const unsupported = [];

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
    const editorOutput =
      parsed.editor === 'intellij'
        ? generateIdeaVimrc(intents, { registry })
        : JSON.stringify(generateVSCodeBindings(intents, { registry }), null, 2) + '\n';

    const outputDir = resolve(parsed.outputDir);
    const outputFiles =
      parsed.editor === 'intellij'
        ? [join(outputDir, '.vimrc'), join(outputDir, '.ideavimrc')]
        : [join(outputDir, '.vimrc'), join(outputDir, 'vscode-keybindings.json')];

    const report = generateReport({
      target: parsed.editor,
      configPath: config.config_path,
      total: intents.length,
      translated,
      manual,
      unsupported,
      outputs: outputFiles,
    });

    if (!parsed.dryRun) {
      await mkdir(outputDir, { recursive: true });
      await writeFile(outputFiles[0], vimrcText, 'utf8');
      await writeFile(outputFiles[1], editorOutput, 'utf8');
    }

    console.log(report.trimEnd());

    printDetectionWarnings(config, extracted);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  }
}

function parseArgs(argv) {
  const flags = {
    help: false,
    version: false,
    dryRun: false,
    outputDir: '.',
    editor: null,
  };

  const tokens = [...argv];

  if (tokens[0] === 'run') {
    tokens.shift();
  }

  for (let i = 0; i < tokens.length; i += 1) {
    const arg = tokens[i];

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

    if (arg === '--output') {
      flags.outputDir = tokens[i + 1] ?? flags.outputDir;
      i += 1;
      continue;
    }

    if (!flags.editor) {
      flags.editor = arg;
      continue;
    }
  }

  return flags;
}

function printHelp(error) {
  if (error) {
    console.error(error);
    console.error('');
  }

  console.log(`Usage: ${pkg.bin['nvim-keybind-migrator']} <editor> [options]`);
  console.log('');
  console.log('Editors:');
  console.log('  vscode      Generate .vimrc + vscode-keybindings.json');
  console.log('  intellij    Generate .vimrc + .ideavimrc');
  console.log('');
  console.log('Options:');
  console.log('  --output <dir>    Output directory (default: current directory)');
  console.log('  --dry-run         Print report only, do not write files');
  console.log('  --help, -h        Show help');
  console.log('  --version, -v     Show version');
  console.log('');
  console.log('Compatibility:');
  console.log('  run <editor> [options] is also accepted.');
}

function printDetectionWarnings(config, extracted) {
  const extractionMeta = extracted?._meta ?? {};
  const extractionWarnings = Array.isArray(extracted?._warnings)
    ? extracted._warnings
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

  if (extractionMeta.fallback_from) {
    console.warn(
      `Warning: extraction fell back from ${extractionMeta.fallback_from} to ${extractionMeta.extraction_mode} (${extractionMeta.fallback_reason})`
    );
  }

  if (extractionWarnings.length > 0) {
    console.warn(`Extraction warnings (${extractionWarnings.length}):`);
    for (const warning of extractionWarnings.slice(0, 5)) {
      console.warn(`- ${warning}`);
    }
  }
}
