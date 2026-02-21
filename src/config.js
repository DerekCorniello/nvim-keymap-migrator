import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const START_MARKER = '__NVIM_KEYMAP_MIGRATOR_CONFIG_START__';
const END_MARKER = '__NVIM_KEYMAP_MIGRATOR_CONFIG_END__';

const INJECT_LUA = `
local warnings = {}
_G.__nkm_cfg_source_ok = nil

local function add_warning(message)
  table.insert(warnings, tostring(message))
end

function _G.__nkm_cfg_source_user_config()
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

  _G.__nkm_cfg_source_ok = source_ok
end

function _G.__nkm_cfg_emit(mode_label)
  local leader = vim.g.mapleader
  local maplocalleader = vim.g.maplocalleader
  local mapleader_set = (leader ~= nil or maplocalleader ~= nil)

  local payload = {
    leader = leader ~= nil and tostring(leader) or (maplocalleader ~= nil and tostring(maplocalleader) or '\\\\'),
    mapleader_set = mapleader_set,
    maplocalleader = maplocalleader ~= nil and tostring(maplocalleader) or nil,
    config_path = vim.fn.stdpath('config'),
    source_ok = _G.__nkm_cfg_source_ok,
    mode = mode_label,
    warnings = warnings,
  }

  io.write('${START_MARKER}\\n')
  io.write(vim.json.encode(payload))
  io.write('\\n${END_MARKER}\\n')
  vim.cmd('qa!')
end
`;

export async function detectConfig() {
  const tempDir = await mkdtemp(join(tmpdir(), 'nvim-keymap-migrator-config-'));
  const scriptPath = join(tempDir, 'config.lua');

  try {
    await writeFile(scriptPath, INJECT_LUA, 'utf8');

    let runtimeError = null;
    let payload = null;

    try {
      payload = await runConfigDetection(scriptPath, tempDir, 'runtime');
    } catch (error) {
      runtimeError = error;
    }

    if (!payload) {
      payload = await runConfigDetection(scriptPath, tempDir, 'strict');
      payload.mode = 'strict';
      payload.fallback_from = 'runtime';
      payload.fallback_reason = summarizeError(runtimeError);
      payload.warnings = Array.isArray(payload.warnings) ? payload.warnings : [];
      payload.warnings.unshift(
        `runtime_config_detection_failed: ${summarizeError(runtimeError)}`
      );
    }

    return {
      leader: payload.leader ?? '\\',
      mapleader_set: Boolean(payload.mapleader_set),
      maplocalleader: payload.maplocalleader ?? null,
      config_path: payload.config_path ?? null,
      source_ok: payload.source_ok ?? null,
      mode: payload.mode ?? 'unknown',
      fallback_from: payload.fallback_from ?? null,
      fallback_reason: payload.fallback_reason ?? null,
      warnings: Array.isArray(payload.warnings) ? payload.warnings : [],
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function runConfigDetection(scriptPath, tempDir, mode) {
  return new Promise((resolve, reject) => {
    const logPath = join(tempDir, `nvim-config-${mode}.log`);
    const args = ['--headless'];

    if (mode === 'strict') {
      args.push('-u', 'NONE');
    }

    args.push('--cmd', `lua dofile([[${scriptPath}]])`);

    if (mode === 'strict') {
      args.push('-c', 'lua _G.__nkm_cfg_source_user_config()');
    }

    args.push('-c', `lua _G.__nkm_cfg_emit('${mode}')`);

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
      let payload = null;
      try {
        payload = extractPayload(combined);
      } catch (error) {
        reject(
          new Error(`Failed to parse config payload (${mode}): ${error.message}`)
        );
        return;
      }

      if (payload !== null) {
        resolve(payload);
        return;
      }

      if (code !== 0) {
        reject(
          new Error(`Neovim config detection failed (${mode}): ${combined.trim()}`)
        );
        return;
      }

      reject(new Error(`Config payload not found (${mode}).`));
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

function summarizeError(error) {
  if (!error) {
    return 'unknown_runtime_error';
  }

  const message =
    typeof error.message === 'string' && error.message.trim()
      ? error.message.trim()
      : String(error);

  return message.split('\n')[0];
}
