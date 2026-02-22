#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { extractKeymaps } from "./src/extractor.js";
import { detectConfig } from "./src/config.js";
import { detectIntents } from "./src/detector.js";
import { loadMappings, lookupIntent } from "./src/registry.js";
import { generateVimrc, isPureVimMapping } from "./src/generators/vimrc.js";
import { generateIdeaVimrc } from "./src/generators/intellij.js";
import { generateVSCodeBindings } from "./src/generators/vscode.js";
import { generateReport } from "./src/report.js";
import { ensureNamespaceDir, getRcPath } from "./src/namespace.js";
import {
  integrateIdeaVim,
  cleanIdeaVim,
  integrateVSCode,
  cleanVSCode,
  saveMetadata,
} from "./src/install.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const pkg = JSON.parse(readFileSync(join(__dirname, "package.json"), "utf8"));
const args = process.argv.slice(2);

await main(args);

function checkNeovimAvailable() {
  return new Promise((resolve) => {
    const proc = spawn("nvim", ["--version"], { stdio: "ignore" });
    proc.on("error", () => resolve(false));
    proc.on("close", (code) => resolve(code === 0));
  });
}

async function main(argv) {
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

  if (!["vscode", "intellij"].includes(parsed.editor)) {
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

async function handleGenerate(parsed) {
  try {
    const nvimAvailable = await checkNeovimAvailable();
    if (!nvimAvailable) {
      console.error("Error: Neovim not found. Please install Neovim 0.8+");
      process.exitCode = 1;
      return;
    }

    const config = await detectConfig();
    const extracted = await extractKeymaps();
    const intents = detectIntents(extracted);
    const registry = loadMappings();

    if (intents.length === 0) {
      console.log("No user-defined keymaps found in your Neovim config.");
      console.log("Nothing to write.");
      return;
    }

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
    const pureVim = intents.filter(isPureVimMapping);
    const counts = {
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
        manualPlugin: manual.filter((item) => item.category === "plugin"),
        manualOther: manual.filter((item) => item.category !== "plugin"),
        pureVim,
        unsupported: unsupported.filter((item) => !isPureVimMapping(item)),
        outputs: [],
      });
      console.log(report.trimEnd());
      printDetectionWarnings(config, extracted);
      return;
    }

    await ensureNamespaceDir();
    const vimrcPath = getRcPath("neovim");
    await writeFile(vimrcPath, vimrcText, "utf8");

    console.log("=== nvim-keymap-migrator ===");
    console.log(`Editor: ${parsed.editor}`);
    console.log(`Config: ${config.config_path}`);
    console.log(`Leader: ${leaderLabel}`);
    console.log("");

    if (parsed.editor === "intellij") {
      const ideaVimrcResult = generateIdeaVimrc(intents, { registry });
      const ideaVimrcText = ideaVimrcResult.text;
      const ideaDefaults = ideaVimrcResult.defaultsAdded ?? 0;
      const result = await integrateIdeaVim(ideaVimrcText, {
        leader: config.leader,
      });

      await saveMetadata(config, counts);

      console.log(`Shared .vimrc: ${vimrcPath}`);
      console.log("");
      console.log("IntelliJ:");
      console.log("  Mappings appended to ~/.ideavimrc");
      if (result.updated) {
        console.log("  (replaced previous mappings)");
      }
      console.log(`  Defaults added: ${ideaDefaults}`);
    } else if (parsed.editor === "vscode") {
      const vscodeBindings = generateVSCodeBindings(intents, { registry });
      const result = await integrateVSCode(vscodeBindings, {
        leader: config.leader,
      });

      await saveMetadata(config, counts, { leaderSet: result.setLeader });

      console.log(`Shared .vimrc: ${vimrcPath}`);
      console.log("");
      console.log("VS Code:");
      console.log("  Keybindings merged into settings.json");
      if (result.setLeader) {
        console.log("  vim.leader set in settings.json");
      }
      if (result.sections) {
        console.log(`  Sections: ${result.sections.join(", ")}`);
      }
      if (result.warnings) {
        for (const w of result.warnings) {
          console.log(`  ${w}`);
        }
      }
      const vsDefaults = vscodeBindings._meta?.defaultsAdded ?? 0;
      console.log(`  Defaults added: ${vsDefaults}`);
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

async function handleClean(editor) {
  try {
    console.log("=== nvim-keymap-migrator --clean ===");
    console.log(`Editor: ${editor}`);
    console.log("");

    if (editor === "intellij") {
      const result = await cleanIdeaVim();
      if (result.cleaned) {
        console.log("Removed managed mappings from ~/.ideavimrc");
      } else {
        console.log("No managed mappings found in ~/.ideavimrc");
      }
    } else if (editor === "vscode") {
      const result = await cleanVSCode();
      if (result.cleaned) {
        console.log(
          `Removed ${result.removed} keybinding(s) from settings.json`,
        );
        if (result.sections) {
          console.log(`Sections cleaned: ${result.sections.join(", ")}`);
        }
        if (result.removedLeader) {
          console.log("Removed vim.leader from settings.json");
        }
      } else {
        console.log("No managed keybindings found in settings.json");
      }
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
    clean: false,
    editor: null,
    error: null,
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

    if (arg === "--clean") {
      flags.clean = true;
      continue;
    }

    if (arg === "run") {
      continue;
    }

    if (!flags.editor && ["vscode", "intellij"].includes(arg)) {
      flags.editor = arg;
      continue;
    }

    if (arg.startsWith("-")) {
      flags.error = `Unknown option: ${arg}`;
      return flags;
    }

    flags.error = `Unknown argument: ${arg}`;
    return flags;
  }

  return flags;
}

function printHelp(error) {
  if (error) {
    console.error(error);
    console.error("");
  }

  console.log(`Usage: ${pkg.bin["nvim-keybind-migrator"]} <editor> [options]`);
  console.log("");
  console.log("Editors:");
  console.log(
    "  vscode             Generate and integrate keybindings for VS Code",
  );
  console.log(
    "  intellij           Generate and integrate keybindings for IntelliJ",
  );
  console.log("");
  console.log("Options:");
  console.log("  --dry-run          Print report without writing files");
  console.log(
    "  --clean            Remove managed keybindings from editor config",
  );
  console.log("  --help, -h         Show help");
  console.log("  --version, -v      Show version");
  console.log("");
  console.log("Examples:");
  console.log("  nvim-keybind-migrator vscode        # Integrate with VS Code");
  console.log(
    "  nvim-keybind-migrator intellij      # Integrate with IntelliJ",
  );
  console.log(
    "  nvim-keybind-migrator vscode --dry-run  # Preview without changes",
  );
  console.log(
    "  nvim-keybind-migrator vscode --clean    # Remove VS Code keybindings",
  );
  console.log("");
  console.log("Files modified:");
  console.log("  IntelliJ: ~/.ideavimrc");
  console.log("  VS Code:  settings.json (platform-specific path)");
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
