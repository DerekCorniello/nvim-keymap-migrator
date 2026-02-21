# nvim-keymap-migrator

A CLI tool that extracts user-defined keymaps from your Neovim configuration and generates a `.vimrc` file for use with vim emulator plugins.

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

  <editor>             one of `vscode` (vscode-keybindings.json) or `intellij` (.ideavimrc)
  --output <dir>       directory for output files (default: current folder)
  --dry-run            print the translation report without writing files
  --vimrc-name <name>  custom name for the shared vimrc (default: .vimrc)
  --editor-name <name> custom name for the IDE file (.ideavimrc / vscode-keybindings.json)
  --help, -h           show help
  --version, -v        show version
```

Aliases such as `nvim-keymap-migrator run vscode` are still supported for backwards compatibility, but the `<editor>` argument is now required.

## Output

Generates a `.vimrc` file containing your user-defined keymaps:

```vim
nnoremap <silent> <leader>ff <cmd>lua require('telescope.builtin').find_files()<CR>
vnoremap J :m '>+1<CR>gv=gv
nnoremap <leader>e :NvimTreeToggle<CR>
```

Import into your editor's vim emulator:

- **IdeaVim (IntelliJ):** Copy to `~/.ideavimrc`
- **VSCodeVim (VS Code):** Add to your VS Code settings

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
