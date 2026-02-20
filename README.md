# nvim-keymap-migrator

A CLI tool that extracts user-defined keymaps from your Neovim configuration and generates importable keymap files for other editors.

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
# Extract keymaps and generate all formats
nvim-keymap-migrator run

# Generate only specific format(s)
nvim-keymap-migrator run --format vimrc
nvim-keymap-migrator run --format vscode
nvim-keymap-migrator run --format intellij
nvim-keymap-migrator run --format vimrc,vscode

# Custom output directory
nvim-keymap-migrator run --output ~/Desktop/keymaps

# Preview without writing files
nvim-keymap-migrator run --dry-run

# Show help
nvim-keymap-migrator --help
nvim-keymap-migrator --version
```

## How It Works

### 1. Extraction

Uses `nvim --headless` to load your config and extract **only user-defined keymaps**:

- Filters out built-in Neovim mappings
- Filters out plugin mappings (outside your config directory)
- Preserves buffer-local keymaps (LSP, etc.) with metadata

### 2. Matching Pipeline

Deterministic pipeline for mapping nvim actions to IDE commands:

```
desc/rhs → normalize → alias resolve → canonical key → IDE command
```

- **Normalize**: lowercase, spaces → underscores, strip punctuation
- **Alias resolve**: Check aliases for known variations
- **Canonical lookup**: Check mappings for IDE commands

### 3. Generation

Outputs keymap files in multiple formats.

## Output Formats

### `.vimrc` (Vim Emulator Plugins)

For use with IdeaVim (IntelliJ) or VSCodeVim (VS Code). Includes ALL keymaps - even unmapped ones.

```vim
nnoremap <silent> <leader>ff <cmd>lua require('telescope.builtin').find_files()<CR>
vnoremap J :m '>+1<CR>gv=gv
```

### `keybindings.json` (VS Code Native)

Native VS Code keybindings format. Only includes mapped keymaps.

```json
[
  { "key": "ctrl+p", "command": "workbench.action.quickOpen" },
  { "key": "ctrl+shift+f", "command": "workbench.action.findInFiles" }
]
```

Import: VS Code → Keyboard Shortcuts → Open JSON icon → paste contents

### `keymap.xml` (IntelliJ Native)

Native IntelliJ keymap format. Only includes mapped keymaps.

```xml
<keymap version="1" name="nvim-import" parent="Default for XWin">
  <action id="GotoFile">
    <keyboard-shortcut first-keystroke="ctrl P" />
  </action>
</keymap>
```

Import: Settings → Keymap → Import → select file

## Lua Callback Handling

Neovim keymaps bound to Lua functions are opaque to other editors. This tool:

1. Uses the `desc` field to identify the action
2. Matches against the mapping database
3. Includes all in `.vimrc` (for vim emulator plugins)
4. Skips unmapped in native formats with warning

**Tip:** Add `desc` fields to your Lua keymaps:

```lua
vim.keymap.set('n', '<leader>ff', function() 
  require('telescope.builtin').find_files() 
end, { desc = 'find_files' })
```

## Buffer-Local Keymaps

LSP keymaps (defined in `on_attach`) and other buffer-local keymaps are:

- Preserved in extraction with `buffer_local: true` metadata
- Listed separately in the summary output
- Included in `.vimrc` output

## Custom Mappings

Extend the built-in mappings by editing:
- `templates/default-mappings.json` - Canonical mappings
- `templates/aliases.json` - Alias variations

Or create `.nvim-mappings.json` in your config directory.

## Supported Editors

| Editor | Format | Import Method |
|--------|--------|---------------|
| VS Code + VSCodeVim | `.vimrc` | Copy to settings |
| VS Code (native) | `keybindings.json` | Keyboard Shortcuts → JSON |
| IntelliJ + IdeaVim | `.vimrc` | Copy to `~/.ideavimrc` |
| IntelliJ (native) | `keymap.xml` | Settings → Keymap → Import |

## Development

```bash
git clone https://github.com/DerekCorniello/nvim-keymap-migrator
cd nvim-keymap-migrator
npm install
npm link  # Makes command available globally
```

## License

GPL-3.0-only
