// Translation report generator (Step 9 in PLAN.md).

export function generateReport(data) {
  const translated = Array.isArray(data?.translated) ? data.translated : [];
  const manual = Array.isArray(data?.manual) ? data.manual : [];
  const unsupported = Array.isArray(data?.unsupported) ? data.unsupported : [];
  const outputs = Array.isArray(data?.outputs) ? data.outputs : [];
  const total = Number.isFinite(data?.total) ? data.total : translated.length + manual.length + unsupported.length;

  const lines = [];
  lines.push('=== nvim-keymap-migrator ===');
  lines.push(`Target: ${data?.target ?? 'unknown'}`);
  lines.push(`Config: ${data?.configPath ?? 'unknown'}`);
  lines.push('');

  lines.push(`Translated: ${translated.length}`);
  for (const item of translated.slice(0, 20)) {
    lines.push(`  ${item.lhs} -> ${item.command}`);
  }
  if (translated.length > 20) {
    lines.push(`  ... and ${translated.length - 20} more`);
  }
  lines.push('');

  lines.push(`Manual intervention: ${manual.length}`);
  for (const item of manual.slice(0, 20)) {
    lines.push(`  ${item.lhs} -> ${item.intent}`);
  }
  if (manual.length > 20) {
    lines.push(`  ... and ${manual.length - 20} more`);
  }
  lines.push('');

  lines.push(`Unsupported: ${unsupported.length}`);
  for (const item of unsupported.slice(0, 20)) {
    lines.push(`  ${item.lhs} -> ${item.raw_rhs}`);
  }
  if (unsupported.length > 20) {
    lines.push(`  ... and ${unsupported.length - 20} more`);
  }
  lines.push('');

  if (outputs.length > 0) {
    lines.push('Output files:');
    for (const output of outputs) {
      lines.push(`  ${output}`);
    }
    lines.push('');
  }

  const coverage = total > 0 ? Math.round((translated.length / total) * 100) : 0;
  lines.push(`Coverage: ${coverage}% (${translated.length}/${total})`);

  return `${lines.join('\n')}\n`;
}
