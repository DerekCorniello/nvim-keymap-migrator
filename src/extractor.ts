import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { ExtractionPayload, ExtractionResult } from './types.js';
import { isExtractionPayload } from './validators.js';

const START_MARKER = '__NVIM_KEYMAP_MIGRATOR_JSON_START__';
const END_MARKER = '__NVIM_KEYMAP_MIGRATOR_JSON_END__';

const INJECT_LUA = `
local user_keymaps = {}
local warnings = {}
local original_set = vim.keymap.set
_G.__nkm_source_ok = nil

local function normalize_modes(mode)
  if type(mode) == 'table' then
    return mode
  end
  if type(mode) == 'string' then
    return { mode }
  end
  return { 'n' }
end

local function add_warning(message)
  table.insert(warnings, tostring(message))
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
      rhs_name = nil,
      rhs_line = nil,
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
      local info = debug.getinfo(rhs, 'nS')
      if info then
        entry.rhs_source = info.source
        entry.rhs_what = info.what
        entry.rhs_name = info.name
        entry.rhs_line = info.linedefined
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

function _G.__nkm_source_user_config()
  local config_path = vim.fn.stdpath('config')
  local init_lua = config_path .. '/init.lua'
  local init_vim = config_path .. '/init.vim'
  local source_ok = false

  if vim.fn.filereadable(init_lua) == 1 then
    local ok, err = pcall(dofile, init_lua)
    source_ok = ok
    if not ok then
      add_warning('failed_to_source_init_lua: ' .. tostring(err))
    end
  elseif vim.fn.filereadable(init_vim) == 1 then
    local ok, err = pcall(vim.cmd, 'source ' .. vim.fn.fnameescape(init_vim))
    source_ok = ok
    if not ok then
      add_warning('failed_to_source_init_vim: ' .. tostring(err))
    end
  else
    add_warning('no_init_file_found')
  end

  _G.__nkm_source_ok = source_ok
end

function _G.__nkm_emit_and_quit(mode_label)
  if vim.v.errmsg and vim.v.errmsg ~= '' then
    add_warning('vim_errmsg: ' .. tostring(vim.v.errmsg))
  end

  local payload = {
    keymaps = user_keymaps,
    _meta = {
      leader = vim.g.mapleader or vim.g.maplocalleader or '\\\\',
      mapleader_set = (vim.g.mapleader ~= nil or vim.g.maplocalleader ~= nil),
      config_path = vim.fn.stdpath('config'),
      source_ok = _G.__nkm_source_ok,
      extraction_mode = mode_label,
    },
    _warnings = warnings,
  }

  io.write('${START_MARKER}\\n')
  io.write(vim.json.encode(payload))
  io.write('\\n${END_MARKER}\\n')
  vim.cmd('qa!')
end
`;

export async function extractKeymaps(): Promise<ExtractionResult> {
    const tempDir = await mkdtemp(join(tmpdir(), 'nvim-keymap-migrator-'));
    const scriptPath = join(tempDir, 'inject.lua');

    try {
        await writeFile(scriptPath, INJECT_LUA, 'utf8');
        let runtimeError: unknown = null;
        let payload: unknown = null;

        try {
            payload = await runHeadlessExtraction(scriptPath, tempDir, 'runtime');
        } catch (error) {
            runtimeError = error;
        }

        if (!payload) {
            const fallbackPayload = await runHeadlessExtraction(scriptPath, tempDir, 'strict');
            const meta = fallbackPayload._meta ?? {};
            const warnings = fallbackPayload._warnings ?? [];

            fallbackPayload._meta = {
                ...meta,
                fallback_from: 'runtime',
                fallback_reason: summarizeError(runtimeError),
            };
            fallbackPayload._warnings = [
                `runtime_extraction_failed: ${summarizeError(runtimeError)}`,
                ...warnings,
            ];
            payload = fallbackPayload;
        }

        if (!isExtractionPayload(payload)) {
            throw new Error('Extraction payload had an unexpected shape.');
        }

        const keymaps = payload.keymaps as ExtractionResult;
        keymaps._meta = payload._meta ?? {};
        keymaps._warnings = payload._warnings ?? [];
        return keymaps;
    } finally {
        await rm(tempDir, { recursive: true, force: true });
    }
}

function runHeadlessExtraction(
    scriptPath: string,
    tempDir: string,
    mode: 'runtime' | 'strict'
): Promise<ExtractionPayload> {
    return new Promise((resolve, reject) => {
        const logPath = join(tempDir, `nvim-${mode}.log`);
        const args = ['--headless'];

        if (mode === 'strict') {
            args.push('-u', 'NONE');
        }

        args.push('--cmd', `lua dofile([[${scriptPath}]])`);

        if (mode === 'strict') {
            args.push('-c', 'lua _G.__nkm_source_user_config()');
        }

        args.push('-c', `lua _G.__nkm_emit_and_quit('${mode}')`);

        const nvim = spawn('nvim', args, {
            env: {
                ...process.env,
                NVIM_LOG_FILE: logPath,
            },
        });

        let stdout = '';
        let stderr = '';

        nvim.on('error', (error) => {
            reject(new Error(`Failed to start Neovim process: ${error.message}`));
        });

        nvim.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        nvim.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        nvim.on('close', (code) => {
            const combined = `${stdout}\n${stderr}`;
            let payload: unknown = null;

            try {
                payload = extractPayload(combined);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                reject(new Error(`Failed to parse extraction payload (${mode}): ${message}`));
                return;
            }

            if (payload !== null) {
                if (isExtractionPayload(payload)) {
                    resolve(payload);
                    return;
                }

                reject(new Error(`Extraction payload had an unexpected shape (${mode}).`));
                return;
            }

            if (code !== 0) {
                reject(new Error(`Neovim exited with code ${code}. Output:\n${combined.trim()}`));
                return;
            }

            reject(new Error(`Extraction output not found in Neovim stdout/stderr (${mode}).`));
        });
    });
}

function extractPayload(output: string): unknown | null {
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

function summarizeError(error: unknown): string {
    if (!error) {
        return 'unknown_runtime_error';
    }

    if (error instanceof Error && error.message.trim()) {
        return error.message.trim().split('\n')[0] ?? 'unknown_runtime_error';
    }

    return String(error).split('\n')[0] ?? 'unknown_runtime_error';
}
