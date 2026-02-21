#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { extractKeymaps } from "./src/extractor.js";
import { detectConfig } from "./src/config.js";
import { detectIntents } from "./src/detector.js";
import { loadMappings, lookupIntent } from "./src/registry.js";
import { generateVimrc, isPureVimMapping } from "./src/generators/vimrc.js";
import { generateIdeaVimrc } from "./src/generators/intellij.js";
import { generateVSCodeBindings } from "./src/generators/vscode.js";
import { generateReport } from "./src/report.js";
import {
  ensureNamespaceDir,
  getRcPath,
  writeMetadata,
  readMetadata,
  createInitialMetadata,
} from "./src/namespace.js";
import { runInstall, runUninstall } from "./src/install.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const pkg = JSON.parse(readFileSync(join(__dirname, "package.json"), "utf8"));
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

  if (parsed.command === "uninstall") {
    await handleUninstall();
    return;
  }

  if (parsed.command === "install") {
    if (!parsed.editor) {
      printHelp(
        'Missing required <editor> for install. Use "vscode" or "intellij".',
      );
      process.exitCode = 1;
      return;
    }
    await handleInstall(parsed.editor);
    return;
  }

  if (!parsed.editor) {
    printHelp('Missing required <editor>. Use "vscode" or "intellij".');
    process.exitCode = 1;
    return;
  }

  if (!["vscode", "intellij"].includes(parsed.editor)) {
    printHelp(`Unsupported editor: ${parsed.editor}`);
    process.exitCode = 1;
    return;
  }

  await handleGenerate(parsed);
}

async function handleGenerate(parsed) {
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
      parsed.editor === "intellij"
        ? generateIdeaVimrc(intents, { registry })
        : JSON.stringify(
            generateVSCodeBindings(intents, { registry }),
            null,
            2,
          ) + "\n";

    const outputDir = resolve(parsed.outputDir);
    const vimrcFileName = parsed.vimrcName ?? "nkm.vimrc";
    const editorFileName =
      parsed.editorName ??
      (parsed.editor === "intellij"
        ? "nkm.ideavimrc"
        : "nkm-vscode-keybindings.json");

    const outputFiles =
      parsed.editor === "intellij"
        ? [join(outputDir, vimrcFileName), join(outputDir, editorFileName)]
        : [join(outputDir, vimrcFileName), join(outputDir, editorFileName)];

    const pureVim = intents.filter(isPureVimMapping);
    const manualPlugin = manual.filter((item) => item.category === "plugin");
    const manualOther = manual.filter((item) => item.category !== "plugin");
    const unsupportedFiltered = unsupported.filter(
      (item) => !isPureVimMapping(item),
    );
    const finalOutputs = parsed.dryRun ? [] : outputFiles;

    const leaderLabel = formatKeyDisplay(config.leader);

    const report = generateReport({
      target: parsed.editor,
      configPath: config.config_path,
      leader: leaderLabel,
      total: intents.length,
      translated,
      manual,
      manualPlugin,
      manualOther,
      pureVim,
      unsupported: unsupportedFiltered,
      outputs: finalOutputs,
    });

    if (!parsed.dryRun) {
      await mkdir(outputDir, { recursive: true });
      await writeFile(outputFiles[0], vimrcText, "utf8");
      await writeFile(outputFiles[1], editorOutput, "utf8");
    }

    console.log(report.trimEnd());

    printDetectionWarnings(config, extracted);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  }
}

async function handleInstall(editor) {
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

      const command = lookupIntent(item.intent, editor, registry);
      if (!command) {
        manual.push(item);
        continue;
      }

      translated.push({ ...item, command });
    }

    const vimrcText = generateVimrc(intents);
    const pureVim = intents.filter(isPureVimMapping);
    const counts = {
      total: intents.length,
      translated: translated.length,
      pureVim: pureVim.length,
      manual: manual.length,
      unsupported: unsupported.length,
    };

    let result;
    let vimrcPath;

    if (editor === "intellij") {
      const ideaVimrcText = generateIdeaVimrc(intents, { registry });
      await ensureNamespaceDir();

      const rcPath = getRcPath("intellij");
      vimrcPath = getRcPath("neovim");

      await writeFile(rcPath, ideaVimrcText, "utf8");
      await writeFile(vimrcPath, vimrcText, "utf8");

      result = await runInstall(editor, config, counts, {
        files: [rcPath, vimrcPath],
      });
    } else if (editor === "vscode") {
      const vscodeBindings = generateVSCodeBindings(intents, { registry });
      await ensureNamespaceDir();

      vimrcPath = getRcPath("neovim");
      await writeFile(vimrcPath, vimrcText, "utf8");

      result = await runInstall(editor, config, counts, {
        bindings: vscodeBindings,
        files: [vimrcPath],
      });
    }

    const leaderLabel = formatKeyDisplay(config.leader);

    console.log("=== nvim-keymap-migrator install ===");
    console.log(`Editor: ${editor}`);
    console.log(`Config: ${config.config_path}`);
    console.log(`Leader: ${leaderLabel}`);
    console.log("");
    console.log(`Shared VimRC: ${vimrcPath}`);
    console.log("");

    if (editor === "intellij") {
      console.log("IdeaVim:");
      console.log(`  RC file: ${result.rcPath}`);
      console.log(`  Bootstrap added to ~/.ideavimrc`);
    } else if (editor === "vscode") {
      console.log("VS Code:");
      console.log(`  Keybindings merged into settings.json`);
      if (result.vscode?.sections) {
        console.log(`  Sections updated: ${result.vscode.sections.join(", ")}`);
      }
      if (result.vscode?.warnings) {
        for (const w of result.vscode.warnings) {
          console.log(`  ${w}`);
        }
      }
    }

    console.log("");
    console.log(`Total keymaps: ${counts.total}`);
    console.log(`Translated: ${counts.translated}`);
    console.log(`Pure Vim: ${counts.pureVim}`);
    console.log(`Manual review: ${counts.manual}`);
    console.log(`Unsupported: ${counts.unsupported}`);

    printDetectionWarnings(config, extracted);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  }
}

async function handleUninstall() {
  try {
    const metadata = await readMetadata();

    console.log("=== nvim-keymap-migrator uninstall ===");

    const result = await runUninstall();

    if (result.ideavim?.uninstalled) {
      console.log("IdeaVim: bootstrap block removed from ~/.ideavimrc");
    } else {
      console.log("IdeaVim: no bootstrap block found");
    }

    if (result.vscode?.uninstalled) {
      console.log(
        `VS Code: ${result.vscode.removed} keybinding(s) removed from settings.json`,
      );
    } else {
      console.log("VS Code: no managed keybindings found");
    }

    console.log("Namespace directory removed.");

    if (metadata) {
      console.log("");
      console.log(`Previous install info:`);
      console.log(`  Created: ${metadata.created_at}`);
      console.log(`  Leader: ${metadata.leader}`);
    }
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
    outputDir: ".",
    editor: null,
    vimrcName: "nkm.vimrc",
    editorName: null,
    command: null,
  };

  const tokens = [...argv];

  for (let i = 0; i < tokens.length; i += 1) {
    const arg = tokens[i];

    if (arg === "--help" || arg === "-h" || arg === "help") {
      flags.help = true;
      continue;
    }

    if (arg === "--version" || arg === "-v" || arg === "version") {
      flags.version = true;
      continue;
    }

    if (arg === "--dry-run") {
      flags.dryRun = true;
      continue;
    }

    if (arg === "--output") {
      flags.outputDir = tokens[i + 1] ?? flags.outputDir;
      i += 1;
      continue;
    }

    if (arg === "--vimrc-name" || arg === "--vimrc-file") {
      flags.vimrcName = tokens[i + 1] ?? flags.vimrcName;
      i += 1;
      continue;
    }

    if (arg === "--editor-name" || arg === "--editor-file") {
      flags.editorName = tokens[i + 1] ?? flags.editorName;
      i += 1;
      continue;
    }

    if (arg === "install") {
      flags.command = "install";
      continue;
    }

    if (arg === "uninstall") {
      flags.command = "uninstall";
      continue;
    }

    if (arg === "run") {
      continue;
    }

    if (!flags.editor && ["vscode", "intellij"].includes(arg)) {
      flags.editor = arg;
      continue;
    }
  }

  return flags;
}

function printHelp(error) {
  if (error) {
    console.error(error);
    console.error("");
  }

  console.log(`Usage: ${pkg.bin["nvim-keybind-migrator"]} <command> [options]`);
  console.log("");
  console.log("Commands:");
  console.log("  <editor>           Generate outputs (vscode or intellij)");
  console.log("  install <editor>   Install bootstrap hooks for editor");
  console.log("  uninstall          Remove all bootstrap hooks and namespace");
  console.log("");
  console.log("Editors:");
  console.log("  vscode             VS Code with VSCodeVim extension");
  console.log("  intellij           IntelliJ with IdeaVim plugin");
  console.log("");
  console.log("Options:");
  console.log(
    "  --output <dir>    Output directory for <editor> (default: current)",
  );
  console.log("  --dry-run         Print report only, do not write files");
  console.log(
    "  --vimrc-name <f>  Custom name for the shared vimrc (default: nkm.vimrc)",
  );
  console.log("  --editor-name <f> Custom name for the IDE file");
  console.log("  --help, -h        Show help");
  console.log("  --version, -v     Show version");
  console.log("");
  console.log("Namespace:");
  console.log("  Outputs are stored in: ~/.config/nvim-keymap-migrator/");
  console.log("  - .ideavimrc      IdeaVim mappings");
  console.log("  - .vimrc          Shared pure-Vim mappings");
  console.log("  - metadata.json   Installation metadata");
  console.log("");
  console.log("VS Code:");
  console.log("  Keybindings are merged directly into settings.json");
  console.log("  (no separate file in namespace)");
}

function formatKeyDisplay(value) {
  if (value == null) {
    return "<none>";
  }

  if (value.length === 0) {
    return "<empty>";
  }

  const special = {
    " ": "<space>",
    "\t": "<Tab>",
    "\n": "<NL>",
    "\r": "<CR>",
    "\u001B": "<Esc>",
  };

  return [...value]
    .map((char) => special[char] ?? printableChar(char))
    .join("");
}

function printableChar(char) {
  const code = char.charCodeAt(0);
  if (code < 32) {
    return `<0x${code.toString(16).padStart(2, "0")}>`;
  }
  if (char === "\\") {
    return "\\\\";
  }
  return char;
}

function printDetectionWarnings(config, extracted) {
  const extractionMeta = extracted?._meta ?? {};
  const extractionWarnings = Array.isArray(extracted?._warnings)
    ? extracted._warnings
    : [];

  if (config.fallback_from) {
    console.warn(
      `Warning: config detection fell back from ${config.fallback_from} to ${config.mode} (${config.fallback_reason})`,
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
      `Warning: extraction fell back from ${extractionMeta.fallback_from} to ${extractionMeta.extraction_mode} (${extractionMeta.fallback_reason})`,
    );
  }

  if (extractionWarnings.length > 0) {
    console.warn(`Extraction warnings (${extractionWarnings.length}):`);
    for (const warning of extractionWarnings.slice(0, 5)) {
      console.warn(`- ${warning}`);
    }
  }
}
