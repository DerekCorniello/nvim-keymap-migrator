// Internal representation helpers for extracted keymaps.
// Filled in during subsequent implementation steps.

export function createIRRecord(record = {}) {
  return {
    mode: record.mode ?? 'n',
    lhs: record.lhs ?? '',
    raw_rhs: record.raw_rhs ?? '',
    intent: record.intent ?? null,
    confidence: record.confidence ?? 'low',
    translatable: Boolean(record.translatable),
    desc: record.desc ?? null,
    opts: record.opts ?? {}
  };
}
