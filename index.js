#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { extractKeymaps } from './src/extractor.js';

// i find this style... interesting, but it works, so... yeah
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const pkg = JSON.parse(
    readFileSync(join(__dirname, 'package.json'), 'utf8')
);

const args = process.argv.slice(2);

switch (args[0]) {
    case 'help':
    case '--help':
    case '-h':
        console.log(`Usage: ${pkg.name} [options]`);
        // TODO: add more options
        break;

    case 'version':
    case '--version':
    case '-v':
        console.log(pkg.version);
        break;

    case undefined:
    case 'run':
        try {
            let keymaps = await extractKeymaps();
            const meta = keymaps._meta ?? {};
            const warnings = Array.isArray(keymaps._warnings) ? keymaps._warnings : [];

            console.log(`Extracted ${keymaps.length} user-defined keymaps:`);
            console.log(`Extraction mode: ${meta.extraction_mode ?? 'unknown'}`);

            if (meta.fallback_from) {
                console.warn(
                    `Warning: fell back from ${meta.fallback_from} mode to ${meta.extraction_mode} mode (${meta.fallback_reason})`
                );
            }

            if (warnings.length > 0) {
                console.warn(`Extraction warnings (${warnings.length}):`);
                warnings.slice(0, 5).forEach((warning) => {
                    console.warn(`- ${warning}`);
                });
            }

            if (keymaps.length > 0) {
                console.log(keymaps[0]);
            }
        } catch (err) {
            console.error('An error occurred:', err);
        }
        break;
}
