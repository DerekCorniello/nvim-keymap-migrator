# nvim-keymap-migrator overview

nvim-keymap-migrator is a tool designed to help Neovim users migrate their keybindings to other editors. It parses your Neovim configuration files, extracts the keymaps, and generates a keymap file that can be used in other editors.

## Requirements

Telescope.nvim is required to use nvim-keymap-migrator, as it relies on Telescope's functionality to search and index the keymaps.

The only setup done right now is to use Node.js to build this app in JavaScript.

## Development Guidelines

- Use minimal amount of dependencies.
- Write clean and maintainable code.
- Ensure that the tool is easy to use and understand for users of all levels.
- Provide clear documentation and examples for users to get started quickly.
- Always lint and format your code.
- NEVER touch git.

## Project Requirements

- Must be able to parse Neovim configurations that are both obvious and non-obvious, such as:
    - Keymaps defined in Lua files.
    - Keymaps defined in Vimscript files.
    - Keymaps defined in plugin configurations.
    - I believe this can be done via Telescope's functionality to search through the config files and extract the keymaps. There is a telescope keybind to search for keymaps, so we can leverage that to find all the keymaps in the config.
- Must generate a keymap file that can be easily imported into other editors.
    - Intellij
    - Visual Studio Code
    - To start off with, lets just have these two, other editors can be added later on.
    - I believe we can use a .vimrc file format for the generated keymap file, as it is a common format that can be easily imported into other editors. We can also provide an option to generate a JSON file for editors that support JSON keymap files, whatever will work!
