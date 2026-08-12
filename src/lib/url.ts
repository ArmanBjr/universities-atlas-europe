/**
 * Wikidata's P856 values are user-contributed, so they reach us as untrusted
 * strings. Rendering one straight into `href` would let a `javascript:` URL
 * execute on click, so every outbound link goes through this gate.
 */
const SAFE_PROTOCOLS = new Set(["http:", "https:"]);

export function safeUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    return SAFE_PROTOCOLS.has(parsed.protocol) ? parsed.href : null;
  } catch {
    return null;
  }
}

/** "www.tudelft.nl" reads better in a cramped panel than the full URL. */
export function prettyHost(raw: string | null | undefined): string | null {
  const safe = safeUrl(raw);
  if (!safe) return null;
  return new URL(safe).host.replace(/^www\./, "");
}
