# nvim-keymap-migrator

A CLI tool that extracts user-defined keymaps from your Neovim configuration and generates importable keymap files for other editors.

## Note to the Agent:

This project is being done to add functionality while also being a learning experience for me. Please be hesitant to provide fixes, and instead provide guidance and suggestions. I want to be able to learn how to solve problems on my own, and I will ask for help when I need it. Please do not touch git or make any commits. I will handle all of that myself.

## Architecture Overview

```
┌─────────────────────┐
│   Extraction Layer  │  ← Dumb, resilient, annotates everything
│  (Lua + Node spawn) │
└──────────┬──────────┘
           │ JSON with metadata
           │ (buffer_local, origin, warning)
           ▼
┌─────────────────────┐
│  Conversion Layer   │  ← Smart, makes decisions
│  (mappings.js +     │
│   generators/)      │
└─────────────────────┘
```

**Key principle:** Extraction and conversion are separate systems. Extraction is read-only and never crashes. Conversion is where decisions happen.

## How It Works

### 1. Extraction Layer

Uses `nvim --headless` to load your config and extract only **user-defined keymaps**:

- Filters out built-in Neovim mappings
- Filters out plugin mappings (outside config directory)
- Keeps only mappings defined in `stdpath("config")`

**Filtering strategy (pragmatic, 95% correct):**
- `callback` source is in config path
- `desc` field exists (most user mappings have this)
- `script` field starts with config path

**Output includes metadata:**
- `buffer_local: true` for buffer-local keymaps
- `origin: "config"` or `origin: "unknown"` with `warning` field

### 2. Matching Pipeline

Deterministic pipeline for mapping nvim actions to IDE commands:

```
desc/rhs → normalize → alias resolve → canonical key → IDE command
```

1. **Normalize**: lowercase, spaces → underscores, strip punctuation
2. **Alias resolve**: Check `aliases.json` for known variations
3. **Canonical lookup**: Check `default-mappings.json` for IDE commands
4. **No fuzzy matching**: Exact match only, deterministic

### 3. Generation Layer

Outputs keymap files in multiple formats:
- `.vimrc` - For Vim emulator plugins (IdeaVim, VSCodeVim) - includes ALL keymaps
- `keybindings.json` - For VS Code native - only mappable keymaps
- `keymap.xml` - For IntelliJ native - only mappable keymaps

## File Structure

```
nvim-keymap-migrator/
├── index.js              # CLI entry point, argument parsing
├── src/
│   ├── extractor.js      # Spawn headless nvim, filter user keymaps
│   ├── generators/
│   │   ├── vimrc.js      # Generate .vimrc format
│   │   ├── vscode.js     # Generate keybindings.json
│   │   └── intellij.js   # Generate keymap.xml
│   └── mappings.js       # Load/apply nvim→editor action mappings
├── templates/
│   ├── default-mappings.json   # Canonical intent → IDE commands
│   └── aliases.json            # Variations → canonical intent
└── package.json
```

## Keymap Data Structure

Each extracted keymap has:
- `lhs` - The key sequence (e.g., `<leader>ff`)
- `rhs` - The action (command string or `<Lua function>`)
- `mode` - Mode (n, i, v, x, o, c, t)
- `desc` - Description (used for mapping lookup)
- `silent`, `noremap`, `buffer`, `nowait`, `expr` - Options
- `buffer_local` - true if buffer-local (added by extractor)
- `origin` - "config" or "unknown"
- `warning` - Present if source couldn't be resolved

## Mapping Files

### default-mappings.json (Canonical Only)

Defines authoritative mapping from intent to IDE commands:

```json
{
  "find_files": {
    "vscode": "workbench.action.quickOpen",
    "intellij": "GotoFile"
  }
}
```

### aliases.json (Separate)

Maps variations to canonical keys:

```json
{
  "find file": "find_files",
  "find-files": "find_files",
  "telescope find_files": "find_files"
}
```

## Buffer-Local Keymaps

Buffer-local keymaps (LSP keymaps defined in `on_attach`, etc.) are:
- Preserved in extraction output with `buffer_local: true`
- Annotated for conversion layer to handle
- Not automatically dropped - conversion decides

## Development Guidelines

- Use minimal dependencies (prefer Node built-ins)
- Write clean, maintainable JavaScript (ES modules)
- Always lint and format code
- NEVER touch git
- Keep it simple and practical
- Extraction must never crash - degrade gracefully

## CLI Usage

```bash
nvim-keymap-migrator run                    # Extract and generate all formats
nvim-keymap-migrator run --format vimrc     # Only generate .vimrc
nvim-keymap-migrator run --output ./out     # Custom output directory
nvim-keymap-migrator run --dry-run          # Print keymaps, don't write files
nvim-keymap-migrator --help                 # Show help
nvim-keymap-migrator --version              # Show version
```
