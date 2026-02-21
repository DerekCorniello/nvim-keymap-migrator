// Step 1 extraction: monkey-patch vim.keymap.set, source user config, collect mappings.

import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const START_MARKER = '__NVIM_KEYMAP_MIGRATOR_JSON_START__';
const END_MARKER = '__NVIM_KEYMAP_MIGRATOR_JSON_END__';

const INJECT_LUA = `
local user_keymaps = {}
local warnings = {}
local original_set = vim.keymap.set

local function normalize_modes(mode)
  if type(mode) == 'table' then
    return mode
  end
  if type(mode) == 'string' then
    return { mode }
  end
  return { 'n' }
end

vim.keymap.set = function(mode, lhs, rhs, opts)
  opts = opts or {}
  local modes = normalize_modes(mode)

  for _, single_mode in ipairs(modes) do
    local entry = {
      mode = single_mode,
      lhs = lhs,
      rhs_type = type(rhs),
      rhs = nil,
      rhs_source = nil,
      rhs_what = nil,
      desc = opts.desc,
      silent = opts.silent,
      noremap = opts.noremap,
      buffer = opts.buffer,
      nowait = opts.nowait,
      expr = opts.expr,
      callback_source = nil,
    }

    if type(rhs) == 'function' then
      entry.rhs = '<Lua function>'
      local info = debug.getinfo(rhs, 'S')
      if info then
        entry.rhs_source = info.source
        entry.rhs_what = info.what
        entry.callback_source = info.source
      end
    elseif type(rhs) == 'string' then
      entry.rhs = rhs
    else
      entry.rhs = tostring(rhs)
    end

    table.insert(user_keymaps, entry)
  end

  return original_set(mode, lhs, rhs, opts)
end

local config_path = vim.fn.stdpath('config')
local init_lua = config_path .. '/init.lua'
local init_vim = config_path .. '/init.vim'
local source_ok = false

if vim.fn.filereadable(init_lua) == 1 then
  local ok, err = pcall(dofile, init_lua)
  source_ok = ok
  if not ok then
    table.insert(warnings, 'failed_to_source_init_lua: ' .. tostring(err))
  end
elseif vim.fn.filereadable(init_vim) == 1 then
  local ok, err = pcall(vim.cmd, 'source ' .. vim.fn.fnameescape(init_vim))
  source_ok = ok
  if not ok then
    table.insert(warnings, 'failed_to_source_init_vim: ' .. tostring(err))
  end
else
  table.insert(warnings, 'no_init_file_found')
end

local payload = {
  keymaps = user_keymaps,
  _meta = {
    leader = vim.g.mapleader or vim.g.maplocalleader or '\\\\',
    mapleader_set = (vim.g.mapleader ~= nil or vim.g.maplocalleader ~= nil),
    config_path = config_path,
    source_ok = source_ok,
  },
  _warnings = warnings,
}

io.write('${START_MARKER}\\n')
io.write(vim.json.encode(payload))
io.write('\\n${END_MARKER}\\n')
`;

export async function extractKeymaps() {
  const tempDir = await mkdtemp(join(tmpdir(), 'nvim-keymap-migrator-'));
  const scriptPath = join(tempDir, 'inject.lua');

  try {
    await writeFile(scriptPath, INJECT_LUA, 'utf8');
    const payload = await runHeadlessExtraction(scriptPath);
    const keymaps = Array.isArray(payload?.keymaps) ? payload.keymaps : [];

    keymaps._meta = payload?._meta ?? {};
    keymaps._warnings = payload?._warnings ?? [];

    return keymaps;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function runHeadlessExtraction(scriptPath) {
  return new Promise((resolve, reject) => {
    const nvim = spawn('nvim', [
      '--headless',
      '-u',
      'NONE',
      '-c',
      `lua dofile([[${scriptPath}]])`,
      '-c',
      'qa!',
    ]);

    let stdout = '';
    let stderr = '';

    nvim.on('error', (err) => {
      reject(new Error(`Failed to start Neovim process: ${err.message}`));
    });

    nvim.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    nvim.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    nvim.on('close', (code) => {
      const combined = `${stdout}\n${stderr}`;
      const payload = extractPayload(combined);

      if (payload) {
        resolve(payload);
        return;
      }

      if (code !== 0) {
        reject(
          new Error(
            `Neovim exited with code ${code}. Output:\n${combined.trim()}`
          )
        );
        return;
      }

      reject(
        new Error('Extraction output not found in Neovim stdout/stderr.')
      );
    });
  });
}

function extractPayload(output) {
  const start = output.indexOf(START_MARKER);
  const end = output.indexOf(END_MARKER);

  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  const json = output.slice(start + START_MARKER.length, end).trim();
  if (!json) {
    return null;
  }

  return JSON.parse(json);
}
