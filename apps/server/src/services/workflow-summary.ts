export function summarizeWorkflowJson(value: unknown, maxBytes = 8 * 1024): unknown {
  const serialized = JSON.stringify(value ?? null);
  const originalBytes = Buffer.byteLength(serialized, "utf8");
  if (originalBytes <= maxBytes) return value;

  return {
    truncated: true,
    preview: serialized.slice(0, Math.max(16, Math.floor(maxBytes / 2))),
    originalBytes,
  };
}
