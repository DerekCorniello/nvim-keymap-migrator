import type { RawKeymap, ExtractionPayload, ConfigPayload } from './types.js';
import { isPlainObject, isString, isBoolean, isArrayOf } from './validators/common.js';

/**
 * Runtime alias for plain-object checks used throughout the codebase.
 *
 * Narrowing helper: use this to ensure a value is a non-null object
 * (not an array) before treating it as a keyed container.
 */
export const isObject = isPlainObject;

/**
 * Narrow unknown to `string | null`.
 */
export function isStringOrNull(v: unknown): v is string | null {
    return v === null || isString(v);
}

/**
 * Type guard for a RawKeymap emitted by Neovim. This checks a few
 * commonly relied-upon fields; other properties are intentionally
 * permissive to allow for plugin-specific fields.
 */
export function isRawKeymap(obj: unknown): obj is RawKeymap {
    if (!isObject(obj)) return false;
    const lhs = obj['lhs'];
    if (lhs !== undefined && lhs !== null && !isString(lhs)) return false;
    const mode = obj['mode'];
    if (mode !== undefined && mode !== null && !isString(mode)) return false;
    const desc = obj['desc'];
    if (desc !== undefined && desc !== null && !isString(desc)) return false;
    // other fields are allowed to be any/unknown
    return true;
}

/**
 * Type guard for the payload emitted by the extraction Lua script.
 *
 * Validates that the shape contains a `keymaps` array and that any
 * `_warnings` member is an array of strings. This is intentionally
 * permissive about other fields so the extractor can evolve safely.
 */
export function isExtractionPayload(p: unknown): p is ExtractionPayload {
    if (!isObject(p)) return false;
    const km = (p as Record<string, unknown>)['keymaps'];
    if (!isArrayOf<RawKeymap>(km, isRawKeymap)) return false;
    const warnings = (p as Record<string, unknown>)['_warnings'];
    if (warnings !== undefined && !isArrayOf<string>(warnings, isString)) return false;
    return true;
}

/**
 * Type guard for the configuration-detection payload produced by
 * the headless Neovim detection script.
 *
 * It validates common fields (`leader`, `mapleader_set`, `mode` and
 * `warnings`) and is conservative about any other properties.
 */
export function isConfigPayload(p: unknown): p is ConfigPayload {
    if (!isObject(p)) return false;
    const leader = p['leader'];
    if (leader !== undefined && leader !== null && !isString(leader)) return false;
    const mapleader_set = p['mapleader_set'];
    if (mapleader_set !== undefined && !isBoolean(mapleader_set)) return false;
    const mode = p['mode'];
    if (mode !== undefined && !isString(mode)) return false;
    const warnings = p['warnings'];
    if (warnings !== undefined && !isArrayOf<string>(warnings, isString)) return false;
    return true;
}
