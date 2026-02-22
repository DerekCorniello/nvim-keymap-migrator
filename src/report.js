// translation report generator

function formatKeymap(item) {
  return `${item.lhs ?? "<unknown>"} -> ${item.command ?? item.intent ?? item.raw_rhs ?? "??"}`;
}

export function generateReport(data = {}) {
  const target = data.target ?? "unknown";
  const configPath = data.configPath ?? "unknown";
  const leader = data.leader ?? "<unknown>";
  const translated = Array.isArray(data.translated) ? data.translated : [];
  const pureVim = Array.isArray(data.pureVim) ? data.pureVim : [];
  const manualPlugin = Array.isArray(data.manualPlugin)
    ? data.manualPlugin
    : [];
  const manualOther = Array.isArray(data.manualOther) ? data.manualOther : [];
  const unsupported = Array.isArray(data.unsupported) ? data.unsupported : [];
  const outputs = Array.isArray(data.outputs) ? data.outputs : [];
  const total = Number.isFinite(data.total)
    ? data.total
    : translated.length +
      pureVim.length +
      manualPlugin.length +
      manualOther.length +
      unsupported.length;

  const lines = [];
  lines.push("=== nvim-keymap-migrator ===");
  lines.push(`Target: ${target}`);
  lines.push(`Config: ${configPath}`);
  lines.push(`Leader: ${leader}`);
  lines.push("");

  lines.push(`IDE actions (${translated.length}):`);
  if (translated.length === 0) {
    lines.push("  (none)");
  } else {
    translated.forEach((item) => lines.push(`  ${formatKeymap(item)}`));
  }
  lines.push("");

  lines.push(`Pure Vim mappings (${pureVim.length}):`);
  if (pureVim.length === 0) {
    lines.push("  (none)");
  } else {
    pureVim.forEach((item) => lines.push(`  ${formatKeymap(item)}`));
  }
  lines.push("");

  lines.push(`Manual plugin mappings (${manualPlugin.length}):`);
  if (manualPlugin.length === 0) {
    lines.push("  (none)");
  } else {
    manualPlugin.forEach((item) => lines.push(`  ${formatKeymap(item)}`));
  }
  lines.push("");

  lines.push(`Manual (other) mappings (${manualOther.length}):`);
  if (manualOther.length === 0) {
    lines.push("  (none)");
  } else {
    manualOther.forEach((item) => lines.push(`  ${formatKeymap(item)}`));
  }
  lines.push("");

  lines.push(`Unsupported (no intent) (${unsupported.length}):`);
  if (unsupported.length === 0) {
    lines.push("  (none)");
  } else {
    unsupported.forEach((item) => lines.push(`  ${formatKeymap(item)}`));
  }
  lines.push("");

  if (outputs.length > 0) {
    lines.push("Outputs:");
    outputs.forEach((output) => lines.push(`  ${output}`));
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}
