#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// i find this... interesting, but it works, so... yeah
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const pkg = JSON.parse(
    readFileSync(join(__dirname, 'package.json'), 'utf8')
);

const args = process.argv.slice(2);

if (
    args.length === 0 ||
    (args.length === 1 && (args[0] === '-v' || args[0] === '--version'))
) {
    console.log(pkg.version);
    process.exit(0);
}

switch (args[0]) {
    case 'help':
    case '--help':
    case '-h':
        console.log(`Usage: ${pkg.name} [options]`);
        // TODO: add more options

    case 'version':
    case '--version':
    case '-v':
        console.log(pkg.version);
        break;

    case undefined:
    case 'run':
        // TODO: do the logic stuff
}
