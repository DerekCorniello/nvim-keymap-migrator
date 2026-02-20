// Extracts keymaps from Neovim using headless mode
// Uses child_process.spawn to run nvim --headless
// Calls vim.api.nvim_get_keymap() for each mode

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

    return results.map(({ value }) => value.keymaps).flat();
}

function getKeymapsForMode(mode) {
    return new Promise((res, rej) => {
        // some lua shenanigans
        const cmd = `lua local maps=vim.api.nvim_get_keymap('${mode}'); local clean={}; for i,m in ipairs(maps) do local c={}; for k,v in pairs(m) do if k~='callback' then c[k]=v end end clean[i]=c end; io.write(vim.json.encode(clean))`

        // spawn a headless nvim process to get keymaps for the given mode
        const nvim = spawn('nvim', [
            '--headless',
            '-c',
            cmd,
            '-c',
            'q'
        ]);

        nvim.on('error', (err) => {
            rej(`Failed to start Neovim process, is it installed?\n\n${err}`);
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

        // when the process exits, parse the output and res or rej the promise
        nvim.on('close', (code) => {
            if (code === 0) {
                try {
                    const keymaps = JSON.parse(output || errorOutput);
                    res({ mode, keymaps });
                } catch (e) {
                    rej(`Failed to parse keymaps for mode ${mode}: ${e}`);
                }
            } else {
                rej(`Neovim process exited with code ${code}: ${errorOutput}`);
            }
        });
    });
}
