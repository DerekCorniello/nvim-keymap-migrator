# nvim-keymap-migrator

A CLI tool that extracts user-defined keymaps from your Neovim configuration and integrates them with vim emulator plugins (IdeaVim, VSCodeVim, etc.).

## Warning

**Back up your files before running this tool!**

This tool modifies the following files:

- `~/.ideavimrc` (IntelliJ/IdeaVim config)
- VS Code `settings.json` (location varies by platform - see below)

While `--clean` attempts to cleanly remove all changes, **always back up these files** before running:

| Platform | VS Code settings.json                                   |
| -------- | ------------------------------------------------------- |
| Linux    | `~/.config/Code/User/settings.json`                     |
| macOS    | `~/Library/Application Support/Code/User/settings.json` |
| Windows  | `%APPDATA%/Code/User/settings.json`                     |

## Why?

When moving from Neovim to another editor (VS Code, IntelliJ, etc.), you'll likely use a vim emulator plugin like IdeaVim or VSCodeVim. This tool extracts your custom keymaps from your Neovim config so you don't have to manually recreate them.

## Installation

```bash
npm install -g nvim-keymap-migrator
```

## Requirements

- Node.js 18+
- Neovim 0.8+ (for `vim.keymap.set` and `vim.api.nvim_get_keymap`)
- Your Neovim config must be loadable via `nvim --headless`

## Usage

```bash
nvim-keymap-migrator <editor> [options]
```

### Editors

- `vscode` - Generate and integrate keybindings for VS Code
- `intellij` - Generate and integrate keybindings for IntelliJ

### Options

- `--dry-run` - Print report without writing files
- `--clean` - Remove managed keybindings from editor config
- `--help, -h` - Show help
- `--version, -v` - Show version

### Examples

```bash
# Integrate with VS Code
nvim-keymap-migrator vscode

# Integrate with IntelliJ
nvim-keymap-migrator intellij

# Preview without making changes
nvim-keymap-migrator vscode --dry-run

# Remove VS Code keybindings
nvim-keymap-migrator vscode --clean

# Remove IntelliJ mappings
nvim-keymap-migrator intellij --clean
```

## How It Works

### IntelliJ

Mappings are appended to `~/.ideavimrc` wrapped in markers:

```vim
" <<< nvim-keymap-migrator start >>>
" Managed by nvim-keymap-migrator. Run with --clean to remove.
nnoremap <leader>ff <Action>(GotoFile)
" >>> nvim-keymap-migrator end <<<
```

Re-running replaces the content between markers. Use `--clean` to remove.

### VS Code

Keybindings are merged into `settings.json` with a marker field:

```json
"vim.normalModeKeyBindings": [
  { "before": ["<leader>", "f"], "commands": ["workbench.action.quickOpen"], "_managedBy": "nvim-keymap-migrator" }
]
```

Re-running replaces managed keybindings. Use `--clean` to remove them.

## Namespace

A small namespace directory stores shared files:

```
~/.config/nvim-keymap-migrator/
  .vimrc           Shared pure-Vim mappings
  metadata.json    Extraction metadata
```

## What Gets Extracted

Only **user-defined** keymaps are extracted (not plugin defaults or built-in mappings). The tool identifies these by checking:

- If the keymap's callback source is in your config directory
- If the keymap has a `desc` field
- If the keymap's script path starts with your config path

## Limitations

- `<Lua function>` keymaps without a command string are included as comments (vim emulators can't execute arbitrary Lua)
- Buffer-local keymaps are marked with `<buffer>` - they'll only work in the current buffer

## License

GPL-3.0-only
