/**
 * Check whether a value is a string at runtime.
 */
export function isString(v: unknown): v is string {
    return typeof v === 'string';
}

/**
 * Check whether a value is a number at runtime.
 */
export function isNumber(v: unknown): v is number {
    return typeof v === 'number';
}

/**
 * Check whether a value is a boolean at runtime.
 */
export function isBoolean(v: unknown): v is boolean {
    return typeof v === 'boolean';
}

/**
 * Check whether a value is a plain object (not null or an array).
 */
export function isPlainObject(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Validate that `arr` is an array and every element satisfies the
 * provided type guard `fn`.
 */
export function isArrayOf<T>(arr: unknown, fn: (x: unknown) => x is T): arr is T[] {
    return Array.isArray(arr) && arr.every(fn as (x: unknown) => boolean);
}
