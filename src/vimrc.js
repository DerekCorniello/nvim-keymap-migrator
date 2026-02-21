// Generates .vimrc format for Vim emulator plugins (IdeaVim, VSCodeVim)

/* one keymap per line, in the format:
 {
  script: 0,
  mode: 'n',
  sid: 5,
  origin: 'config',
  buffer_local: false,
  lhsraw: ' sr',
  scriptversion: 1,
  mode_bits: 1,
  warning: 'callback_source_outside_config',
  buffer: 0,
  desc: 'Resume last search',
  noremap: 1,
  abbr: 0,
  nowait: 0,
  lhs: ' sr',
  silent: 0,
  lnum: 0,
  expr: 0
}
*/
export function generateVimrc(keymaps) {
  const lines = [];
}
