# nvim-keymap-migrator

A CLI tool that extracts keymaps from your Neovim configuration and generates importable keymap files for other editors.

## Note to the Agent:

This project is being done to add functionality while also being a learning experience for me. Please be hesitant to provide fixes, and instead provide guidance and suggestions. I want to be able to learn how to solve problems on my own, and I will ask for help when I need it. Please do not touch git or make any commits. I will handle all of that myself.

## How It Works

1. **Extraction**: Uses `nvim --headless` to load your full config (plugins included) and calls `vim.api.nvim_get_keymap()` for each mode to extract all keymaps as JSON.

2. **Transformation**: Maps Neovim actions to equivalent editor commands using a configurable mapping file. Lua callbacks use their `desc` field for identification.

3. **Generation**: Outputs keymap files in multiple formats:
   - `.vimrc` - For Vim emulator plugins (IdeaVim, VSCodeVim)
   - `keybindings.json` - For VS Code native keybindings
   - `keymap.xml` - For IntelliJ native keymaps

## Architecture

```
nvim-keymap-migrator/
├── index.js              # CLI entry point, argument parsing
├── src/
│   ├── extractor.js      # Spawn headless nvim, parse keymaps
│   ├── generators/
│   │   ├── vimrc.js      # Generate .vimrc format
│   │   ├── vscode.js     # Generate keybindings.json
│   │   └── intellij.js   # Generate keymap.xml
│   └── mappings.js       # Load/apply nvim→editor action mappings
├── templates/
│   └── default-mappings.json   # Built-in action mappings
└── package.json
```

## Key Concepts

### Keymap Data Structure

Each extracted keymap has:
- `lhs` - The key sequence (e.g., `<leader>ff`)
- `rhs` - The action (command string or `<Lua function>`)
- `mode` - Mode (n, i, v, x, o, c, t)
- `desc` - Description (used to identify Lua callbacks)
- `silent`, `noremap`, `buffer`, `nowait`, `expr` - Options

### Lua Callback Handling

Lua functions show as `<Lua function>` in `rhs`. We handle them by:
1. Using the `desc` field to identify the action
2. Matching against the mappings file
3. If no match found, skip with warning (native) or include as-is (vimrc)

### Buffer-Local Keymaps

Keymaps with `buffer` set are buffer-local (often LSP-related). We prompt the user interactively to include/exclude them.

## Development Guidelines

- Use minimal dependencies (prefer Node built-ins)
- Write clean, maintainable JavaScript (ES modules)
- Always lint and format code
- NEVER touch git
- Keep it simple and practical

## CLI Usage

```bash
nvim-keymap-migrator run                    # Extract and generate all formats
nvim-keymap-migrator run --format vimrc     # Only generate .vimrc
nvim-keymap-migrator run --output ./out     # Custom output directory
nvim-keymap-migrator run --dry-run          # Print keymaps, don't write files
nvim-keymap-migrator --help                 # Show help
nvim-keymap-migrator --version              # Show version
```

## Output Files

| File | Editor | Format |
|------|--------|--------|
| `keymaps.vimrc` | IdeaVim, VSCodeVim | Vimscript `map` commands |
| `keybindings.json` | VS Code | JSON array with `key`, `command`, `when` |
| `keymap.xml` | IntelliJ | XML with `<action>` and `<keyboard-shortcut>` |

## Mapping Actions

The `default-mappings.json` maps nvim patterns to editor commands:

```json
{
  "find_files": {
    "vscode": "workbench.action.quickOpen",
    "intellij": "GotoFile"
  },
  "lsp.buf.definition": {
    "vscode": "editor.action.revealDefinition",
    "intellij": "GotoDeclaration"
  }
}
```

Users can extend this with a custom mappings file.
