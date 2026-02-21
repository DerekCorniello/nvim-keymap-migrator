# nvim-keymap-migrator

A CLI tool that extracts user-defined keymaps from your Neovim configuration and generates a `.vimrc` file for use with vim emulator plugins (IdeaVim, VSCodeVim, etc.).

## Note to the Agent:

This project is being done to add functionality while also being a learning experience for me. Please be hesitant to provide fixes, and instead provide guidance and suggestions. I want to be able to learn how to solve problems on my own, and I will ask for help when I need it. Please do not touch git or make any commits. I will handle all of that myself.

## Architecture Overview

```
┌─────────────────────┐
│   Extraction Layer  │  ← Spawns headless nvim, filters user keymaps
│  (src/extractor.js) │
└──────────┬──────────┘
           │ JSON with metadata
           ▼
┌─────────────────────┐
│  Generation Layer   │  ← Converts to vimrc format
│    (src/vimrc.js)   │
└─────────────────────┘
```

**Simple and focused:** Extract → Generate. No mapping/translation layer.

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

### 2. Generation Layer

Outputs a `.vimrc` file with all extracted keymaps in Vimscript format.

## File Structure

```
nvim-keymap-migrator/
├── index.js              # CLI entry point, argument parsing
├── src/
│   ├── extractor.js      # Spawn headless nvim, filter user keymaps
│   └── vimrc.js          # Generate .vimrc format
└── package.json
```

## Keymap Data Structure

Each extracted keymap has:

- `lhs` - The key sequence (e.g., `<leader>ff`)
- `rhs` - The action (command string or `<Lua function>`)
- `mode` - Mode (n, i, v, x, o, c, t)
- `desc` - Description
- `silent`, `noremap`, `buffer`, `nowait`, `expr` - Options
- `buffer_local` - true if buffer-local (added by extractor)
- `origin` - "config" or "unknown"
- `warning` - Present if source couldn't be resolved

## Buffer-Local Keymaps

Buffer-local keymaps (LSP keymaps defined in `on_attach`, etc.) are:

- Preserved in extraction output with `buffer_local: true`
- Generated with `<buffer>` flag in vimrc

## Development Guidelines

- Use minimal dependencies (prefer Node built-ins)
- Write clean, maintainable JavaScript (ES modules)
- Always lint and format code
- NEVER touch git
- Keep it simple and practical
- Extraction must never crash - degrade gracefully

## CLI Usage

```bash
nvim-keymap-migrator run                    # Extract and generate .vimrc
nvim-keymap-migrator run --output ./out.vim # Custom output file
nvim-keymap-migrator run --dry-run          # Print keymaps, don't write file
nvim-keymap-migrator --help                 # Show help
nvim-keymap-migrator --version              # Show version
```

## Future Expansion

If demand arises for native IDE formats (VS Code keybindings.json, IntelliJ keymap.xml):

- Add `src/mappings.js` for nvim → IDE command translation
- Add `templates/default-mappings.json` and `templates/aliases.json`
- Add generators for each format
