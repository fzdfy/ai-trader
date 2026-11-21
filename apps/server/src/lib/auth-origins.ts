const LOCAL_UI_ORIGIN = "http://localhost:9080";

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

  return [...new Set(candidates)];
}

export function resolveCorsOrigin(
  origin: string | undefined,
  allowedOrigins: ReadonlySet<string>,
): string | null {
  if (!origin) return null;

  try {
    const normalized = normalizeOrigin(origin);
    return normalized && allowedOrigins.has(normalized) ? normalized : null;
  } catch {
    return null;
  }
}
