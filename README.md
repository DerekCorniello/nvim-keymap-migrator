# nvim-keymap-migrator

A CLI tool that extracts user-defined keymaps from your Neovim configuration and integrates them with vim emulator plugins (IdeaVim, VSCodeVim, etc.).

## Warning

**Back up your files before running this tool!**. This tool was made for me, so it may have unintended consequences on your setup. Always review the changes it proposes before applying them.

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
- Editor with a Vim emulator plugin (e.g., IdeaVim for IntelliJ, VSCodeVim for VS Code)
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

The tool extracts keymaps from your Neovim config and categorizes them:

1. **IDE actions** - Keymaps that can be translated to IDE-specific actions (e.g., LSP, file explorer)
2. **Pure Vim mappings** - Native Vim keymaps that work in any Vim emulator
3. **Plugin mappings** - Keymaps from plugins (require manual configuration)
4. **Unsupported** - Keymaps that couldn't be categorized

### IntelliJ

Mappings are appended to `~/.ideavimrc` wrapped in markers:

```vim
" <<< nvim-keymap-migrator start >>>
" Managed by nvim-keymap-migrator. Run with --clean to remove.

" Pure Vim mappings (native Vim motions)
nnoremap K mzK`z
vnoremap K :m '<-2<CR>gv=gv

" IDE action mappings
nnoremap <leader>ff <Action>(GotoFile)
" >>> nvim-keymap-migrator end <<<
```

Re-running replaces the content between markers. Use `--clean` to remove.

### VS Code

VS Code uses a two-pronged approach:

1. **IDE actions** - Merged directly into `settings.json`:

```json
"vim.normalModeKeyBindings": [
  { "before": ["<leader>", "f"], "commands": ["workbench.action.quickOpen"], "_managedBy": "nvim-keymap-migrator" }
]
```

2. **Pure Vim mappings** - Written to a shared `.vimrc` file, configured via `vim.vimrc.path` and `vim.vimrc.enable`:

```json
"vim.vimrc.path": "~/.config/nvim-keymap-migrator/.vimrc",
"vim.vimrc.enable": true
```

The tool manages both settings:

- `vim.vimrc.path` - Set to point to the shared .vimrc
- `vim.vimrc.enable` - Set to `true` only if unset (respects existing user values)

Re-running replaces managed keybindings. Use `--clean` to remove them.

## Namespace

A small namespace directory stores shared files:

```
~/.config/nvim-keymap-migrator/
  .vimrc           Shared pure-Vim mappings (read by VS Code and IntelliJ)
  metadata.json    Extraction metadata
```

## Supported Intents

The tool detects and translates these keymap intents:

### Navigation

- `navigation.file_explorer` - File explorer (`:Ex`, `<leader>pv`)
- `navigation.find_files` - Quick open files
- `navigation.live_grep` - Search in files
- `navigation.buffers` - Switch buffers
- `navigation.recent_files` - Recent files
- `navigation.grep_string` - Search word under cursor

### LSP

- `lsp.definition` - Go to definition (`gd`)
- `lsp.declaration` - Go to declaration (`gD`)
- `lsp.references` - Find references (`gr`)
- `lsp.implementation` - Go to implementation (`gi`)
- `lsp.hover` - Show hover info
- `lsp.signature_help` - Signature help
- `lsp.rename` - Rename symbol
- `lsp.code_action` - Code actions
- `lsp.format` - Format document

### Git

- `git.fugitive` - Git commands
- `git.push` / `git.pull` - Push/pull
- `git.commit` - Git commit

### Pure Vim Mappings

Native Vim motions and commands are detected and output as pure Vim mappings, so any mapping from one Vim command to another is included here.

These work out of the box in any Vim emulator.

## What Gets Extracted

Only **user-defined** keymaps are extracted (not plugin defaults or built-in mappings). The tool identifies these by checking:

- If the keymap's callback source is in your config directory
- If the keymap has a `desc` field
- If the keymap's script path starts with your config path

## Limitations

- `<Lua function>` keymaps without a command string are included as comments (vim emulators can't execute arbitrary Lua)
- Buffer-local keymaps are marked with `<buffer>` - they'll only work in the current buffer
- Some plugin-specific keymaps may require manual configuration

## License

GPL-3.0-only
