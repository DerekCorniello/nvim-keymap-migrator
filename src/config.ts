import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { ConfigPayload, ConfigResult } from './types.js';
import { isPlainObject, isString, isBoolean, isArrayOf } from './validators/common.js';

const START_MARKER = '__NVIM_KEYMAP_MIGRATOR_CONFIG_START__';
const END_MARKER = '__NVIM_KEYMAP_MIGRATOR_CONFIG_END__';
const NVIM_CONFIG_TIMEOUT_MS = 8000;
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
    leader = leader ~= nil and tostring(leader) or (maplocalleader ~= nil and tostring(maplocalleader) or '\\'),
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

function normalizeDetectionMode(mode: ConfigPayload['mode']): ConfigResult['mode'] {
    return mode === 'runtime' || mode === 'strict' || mode === 'unknown' ? mode : 'unknown';
}

/**
 * Detects the user's Neovim configuration by launching a headless Neovim
 * process and running an injected Lua script.
 *
 * This returns a normalized `ConfigResult` with coerced types so the rest
 * of the CLI can rely on stable fields. The function performs a runtime
 * detection (sourcing the user's config) and falls back to a strict
 * detection mode if runtime loading fails.
 *
 * @returns a promise resolving to the normalized configuration result
 */
export async function detectConfig(): Promise<ConfigResult> {
    const tempDir = await mkdtemp(join(tmpdir(), 'nvim-keymap-migrator-config-'));
    const scriptPath = join(tempDir, 'config.lua');
    try {
        await writeFile(scriptPath, INJECT_LUA, 'utf8');
        let runtimeError: unknown = null;
        let payload: unknown = null;
        try {
            payload = await runConfigDetection(scriptPath, tempDir, 'runtime');
        } catch (error) {
            runtimeError = error;
        }
        if (!payload) {
            if (runtimeError instanceof Error && runtimeError.message.includes('timed out')) {
                throw runtimeError;
            }
            const raw = await runConfigDetection(scriptPath, tempDir, 'strict');
            const obj = raw && typeof raw === 'object' ? (raw as ConfigPayload) : {};
            obj['mode'] = 'strict';
            obj['fallback_from'] = 'runtime';
            obj['fallback_reason'] = summarizeError(runtimeError);
            obj['warnings'] = Array.isArray(obj['warnings']) ? obj['warnings'] : [];
            (obj['warnings'] as string[]).unshift(
                `runtime_config_detection_failed: ${summarizeError(runtimeError)}`
            );
            payload = obj;
        }
        const p = isPlainObject(payload) ? (payload as ConfigPayload) : {};
        return {
            leader: isString(p['leader']) ? (p['leader'] as string) : '\\',
            mapleader_set: isBoolean(p['mapleader_set'])
                ? (p['mapleader_set'] as boolean)
                : Boolean(p['mapleader_set']),
            maplocalleader: isString(p['maplocalleader']) ? (p['maplocalleader'] as string) : null,
            config_path: isString(p['config_path']) ? (p['config_path'] as string) : null,
            source_ok: isBoolean(p['source_ok']) ? (p['source_ok'] as boolean) : null,
            mode: normalizeDetectionMode(p['mode']),
            fallback_from: isString(p['fallback_from']) ? (p['fallback_from'] as string) : null,
            fallback_reason: isString(p['fallback_reason'])
                ? (p['fallback_reason'] as string)
                : null,
            warnings: isArrayOf<string>(p['warnings'], isString) ? (p['warnings'] as string[]) : [],
        };
    } finally {
        await rm(tempDir, { recursive: true, force: true });
    }
}
function runConfigDetection(scriptPath: string, tempDir: string, mode: 'runtime' | 'strict') {
    return new Promise<unknown>((resolve, reject) => {
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

        let settled = false;
        const timeout = setTimeout(() => {
            if (settled) return;
            settled = true;
            nvim.kill('SIGKILL');
            reject(
                new Error(
                    `Neovim config detection timed out after ${NVIM_CONFIG_TIMEOUT_MS}ms (${mode}).`
                )
            );
        }, NVIM_CONFIG_TIMEOUT_MS);

        let stdout = '';
        let stderr = '';

        const finish = (fn: () => void) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            fn();
        };

        nvim.on('error', (error) => {
            finish(() => reject(new Error(`Failed to start Neovim process: ${error.message}`)));
        });
        nvim.stdout.on('data', (data) => {
            stdout += data.toString();
        });
        nvim.stderr.on('data', (data) => {
            stderr += data.toString();
        });
        nvim.on('close', (code) => {
            const combined = `${stdout}\n${stderr}`;
            try {
                const payload = extractPayload(combined);
                if (payload !== null) {
                    finish(() => resolve(payload));
                    return;
                }
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                finish(() => reject(new Error(`Failed to parse config payload (${mode}): ${msg}`)));
                return;
            }
            if (code !== 0) {
                finish(() =>
                    reject(
                        new Error(`Neovim config detection failed (${mode}): ${combined.trim()}`)
                    )
                );
                return;
            }
            finish(() => reject(new Error(`Config payload not found (${mode}).`)));
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
    if (!error) return 'unknown_runtime_error';
    if (error instanceof Error && typeof error.message === 'string' && error.message.trim()) {
        const first = error.message.split('\n')[0];
        return first ?? String(error).split('\n')[0] ?? '';
    }
    return String(error).split('\n')[0] ?? '';
}
