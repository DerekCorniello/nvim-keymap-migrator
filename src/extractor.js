// Extracts keymaps from Neovim using headless mode
// Uses child_process.spawn to run nvim --headless
// Calls vim.api.nvim_get_keymap() for each mode
// Filters to only user-defined keymaps

import { spawn } from 'child_process';

const modes = ['n', 'i', 'v', 'x', 's', 'o', 'c', 't']

export async function extractKeymaps() {
    const results = await Promise.allSettled(modes.map(mode => getKeymapsForMode(mode)));

    // get failed tasks
    const failed = results.filter(r => r.status === 'rejected');
    if (failed.length > 0) {
        failed.forEach(({ reason }) => console.error(`Failed to get keymaps: ${reason}`));
        process.exit(1);
    }

    const keymaps = results.map(({ value }) => value.keymaps).flat();
    console.log(`Extracted ${keymaps.length} user-defined keymaps`);
    return keymaps;
}

function getKeymapsForMode(mode) {
    return new Promise((resolve, reject) => {
        // some lua shenanigans
        // gets config path then iterates all keymaps for the mode
        // checks if each keymap is user defined by looking at callback source desc field
        // or script path strips non serializable fields and adds metadata
        // like buffer_local origin and warning then encodes to json and writes to stdout
        const cmd = `lua local config_path=vim.fn.stdpath('config'); local maps=vim.api.nvim_get_keymap('${mode}'); local clean={}; for i,m in ipairs(maps) do local is_user=false; local origin='unknown'; local warning=nil; if m.callback then local info=debug.getinfo(m.callback,'S'); if info and info.source and string.sub(info.source,2)==config_path then is_user=true; origin='config' else warning='callback_source_outside_config' end end; if not is_user and m.desc then is_user=true; origin='config' end; if not is_user and m.script and string.find(m.script,'^'..config_path) then is_user=true; origin='config' end; if is_user then local c={}; for k,v in pairs(m) do if k~='callback' then c[k]=v end end; c.buffer_local=m.buffer~=nil and m.buffer~=0; c.origin=origin; if warning then c.warning=warning end; table.insert(clean,c) end end; io.write(vim.json.encode(clean))`;

        // spawn a headless nvim process to get keymaps for the given mode
        const nvim = spawn('nvim', [
            '--headless',
            '-c',
            cmd,
            '-c',
            'q'
        ]);

        nvim.on('error', (err) => {
            reject(`Failed to start Neovim process, is it installed?\n\n${err}`);
        });

        // get all stdout and stderr output
        let output = '';
        let errorOutput = '';
        nvim.stdout.on('data', (data) => {
            output += data.toString();
        });
        nvim.stderr.on('data', (data) => {
            errorOutput += data.toString();
        });

        // when the process exits, parse the output and resolve or reject the promise
        nvim.on('close', (code) => {
            if (code === 0) {
                try {
                    // nvim outputs to stderr in some versions, try both
                    const jsonOutput = output || errorOutput;
                    const keymaps = JSON.parse(jsonOutput);
                    resolve({ mode, keymaps });
                } catch (e) {
                    reject(`Failed to parse keymaps for mode ${mode}: ${e}`);
                }
            } else {
                reject(`Neovim process exited with code ${code}: ${errorOutput}`);
            }
        });
    });
}
