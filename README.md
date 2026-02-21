# nvim-keymap-migrator

A CLI tool that extracts user-defined keymaps from your Neovim configuration and generates mappings for use with vim emulator plugins (IdeaVim, VSCodeVim, etc.).

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
nvim-keymap-migrator <command> [options]

Commands:
  <editor>            Generate output files (vscode or intellij)
  install <editor>    Install bootstrap hooks for editor
  uninstall           Remove all bootstrap hooks and namespace

Options:
  --output <dir>      Output directory for <editor> (default: current folder)
  --dry-run           Print the translation report without writing files
  --help, -h          Show help
  --version, -v       Show version
```

### Generate Output Files

```bash
nvim-keymap-migrator vscode              # Generate for VS Code
nvim-keymap-migrator intellij            # Generate for IntelliJ
nvim-keymap-migrator vscode --dry-run    # Preview without writing
```

### Install Bootstrap Hooks

Installs mappings to the namespace and configures the editor to use them:

```bash
nvim-keymap-migrator install vscode      # VS Code: updates settings.json
nvim-keymap-migrator install intellij    # IntelliJ: adds source to ~/.ideavimrc
```

### Uninstall

Removes all bootstrap hooks and deletes the namespace directory:

```bash
nvim-keymap-migrator uninstall
```

## Namespace Layout

When using `install`, files are stored in a dedicated namespace:

```
~/.config/nvim-keymap-migrator/
  .ideavimrc       IdeaVim action mappings
  .vimrc           Shared pure-Vim mappings
  metadata.json    Installation metadata
```

Note: VS Code keybindings are merged directly into `~/.config/Code/User/settings.json` (no separate file in namespace).

### Bootstrap Blocks

For IdeaVim, a managed block is added to `~/.ideavimrc`:

```vim
" <<< nvim-keymap-migrator bootstrap start >>>
" This block is managed by nvim-keymap-migrator.
" Do not edit manually. Run 'nvim-keybind-migrator uninstall' to remove.
source ~/.config/nvim-keymap-migrator/.ideavimrc
" >>> nvim-keymap-migrator bootstrap end <<<
```

For VS Code, keybindings are merged into settings.json with a marker:

```json
"vim.normalModeKeyBindings": [
  { "before": ["<leader>", "f"], "commands": ["workbench.action.quickOpen"], "_managedBy": "nvim-keymap-migrator" }
]
```

## What Gets Extracted

Only **user-defined** keymaps are extracted (not plugin defaults or built-in mappings). The tool identifies these by checking:

- If the keymap's callback source is in your config directory
- If the keymap has a `desc` field
- If the keymap's script path starts with your config path

## Limitations

- `<Lua function>` keymaps without a command string are included as comments (vim emulators can't execute arbitrary Lua)
- Buffer-local keymaps are marked with `<buffer>` - they'll only work in the current buffer

## Development

```bash
git clone https://github.com/DerekCorniello/nvim-keymap-migrator
cd nvim-keymap-migrator
npm install
npm link  # Makes command available globally
```

## Linting

```bash
npm run lint
```

Runs `prettier --check` over the repo (make sure `npm install` has been run first).

## License

GPL-3.0-only
