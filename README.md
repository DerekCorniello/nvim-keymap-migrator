# nvim-keymap-migrator

A CLI tool that extracts keymaps from your Neovim configuration and generates importable keymap files for other editors.

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

## Output Formats

### `.vimrc` (Vim Emulator Plugins)

For use with IdeaVim (IntelliJ) or VSCodeVim (VS Code). Generates standard Vimscript mapping commands:

```vim
nnoremap <leader>ff :find_files<CR>
vnoremap J :m '>+1<CR>gv=gv
```

### `keybindings.json` (VS Code Native)

Native VS Code keybindings format:

```json
[
  { "key": "ctrl+p", "command": "workbench.action.quickOpen" },
  { "key": "ctrl+shift+f", "command": "workbench.action.findInFiles" }
]
```

Import: VS Code → Keyboard Shortcuts → Open JSON icon → paste contents

### `keymap.xml` (IntelliJ Native)

Native IntelliJ keymap format:

```xml
<keymap version="1" name="nvim-import" parent="Default for XWin">
  <action id="GotoFile">
    <keyboard-shortcut first-keystroke="ctrl p" />
  </action>
</keymap>
```

Import: Settings → Keymap → Import → select file

## How It Works

1. **Extraction**: Spawns `nvim --headless` to load your config and calls `vim.api.nvim_get_keymap()` for all modes
2. **Transformation**: Maps Neovim actions to editor-specific commands using built-in mappings
3. **Generation**: Writes output files in your chosen format(s)

## Handling Lua Callbacks

Neovim keymaps bound to Lua functions (`vim.keymap.set('n', '<leader>ff', function() ... end)`) are opaque to other editors. This tool handles them by:

1. Using the `desc` field to identify the action
2. Matching against the built-in mapping database
3. Skipping unmappable callbacks in native formats (with warning)
4. Including all callbacks in `.vimrc` format (for vim emulator plugins)

**Tip**: Add `desc` fields to your Lua keymaps for better mapping accuracy:

```lua
vim.keymap.set('n', '<leader>ff', function() require('telescope.builtin').find_files() end, { desc = 'find_files' })
```

## Buffer-Local Keymaps

Keymaps scoped to specific filetypes (LSP keymaps, etc.) are detected and you'll be prompted to include or exclude them during export.

## Custom Mappings

Create a `.nvim-mappings.json` in your config directory to extend the built-in mappings:

```json
{
  "my_custom_action": {
    "vscode": "myExtension.customCommand",
    "intellij": "MyCustomAction"
  }
}
```

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
