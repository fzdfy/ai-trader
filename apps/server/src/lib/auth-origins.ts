const LOCAL_UI_ORIGIN = "http://localhost:9080";
const LOOPBACK_ORIGIN_PATTERNS = [
  "http://localhost:*",
  "http://127.0.0.1:*",
  "http://[::1]:*",
] as const;

function normalizeOrigin(value: string): string | null {
  const candidate = value.trim();
  if (!candidate) return null;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error(`Invalid trusted origin: ${candidate}`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Trusted origin must use http or https: ${candidate}`);
  }
  return url.origin;
}

function matchesOriginPattern(origin: string, pattern: string): boolean {
  if (!pattern.includes("*")) return origin === pattern;
  const source = pattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replaceAll("*", ".*");
  return new RegExp(`^${source}$`).test(origin);
}

export function parseTrustedOrigins(
  raw: string | undefined,
  baseUrl: string | undefined,
): string[] {
  const configured = (raw ?? "")
    .split(",")
    .map(normalizeOrigin)
    .filter((origin): origin is string => origin !== null);

  const candidates =
    configured.length > 0
      ? configured
      : [normalizeOrigin(baseUrl ?? ""), LOCAL_UI_ORIGIN].filter(
          (origin): origin is string => origin !== null,
        );

  return [...new Set([...candidates, ...LOOPBACK_ORIGIN_PATTERNS])];
}

export function resolveCorsOrigin(
  origin: string | undefined,
  allowedOrigins: ReadonlySet<string>,
): string | null {
  if (!origin) return null;

  try {
    const normalized = normalizeOrigin(origin);
    if (!normalized) return null;
    return [...allowedOrigins].some((pattern) => matchesOriginPattern(normalized, pattern))
      ? normalized
      : null;
  } catch {
    return null;
  }
}
