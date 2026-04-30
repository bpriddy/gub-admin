/**
 * oauth-client-validation.ts — guard rails for OAuth Agent Client registration.
 *
 * The OAuth broker accepts a redirect_uri only if it matches one of the URIs
 * we have on file for the requesting client. A foot-gun entry here defeats
 * that check, so the same shape rules we apply to the CORS allow-list apply
 * here:
 *
 *   - Each redirect URI must be a real `<protocol>://<host>[:<port>][/path]`.
 *     A path is allowed (and common — e.g. `/oauth/callback`); query string
 *     and fragment are not (the OAuth spec forbids fragments on the
 *     redirect_uri and we don't expect query strings either).
 *   - Sane protocols only: `https:` always, `http:` only for loopback hosts
 *     (localhost / 127.0.0.1 / ::1) for local-dev agents.
 *   - No wildcards. `*`, `null`, etc. all rejected.
 *   - Length cap at 512 chars per URI (longer than that is almost certainly
 *     a paste error).
 *   - At least one URI required.
 *
 * Returns either { ok: true, normalized } where `normalized` is an array of
 * canonical URIs to persist, or { ok: false, reason } with a message
 * suitable for surfacing back to the operator.
 */

const SPECIAL_TOKENS = new Set(['*', 'null', 'allUsers', 'allAuthenticatedUsers']);
const MAX_LENGTH = 512;
const MAX_URIS = 10;

export type RedirectUrisValidationResult =
  | { ok: true; normalized: string[] }
  | { ok: false; reason: string };

export function validateRedirectUris(input: string[]): RedirectUrisValidationResult {
  if (!Array.isArray(input) || input.length === 0) {
    return { ok: false, reason: 'At least one redirect URI is required.' };
  }
  if (input.length > MAX_URIS) {
    return { ok: false, reason: `Too many redirect URIs (max ${MAX_URIS}).` };
  }

  const normalized: string[] = [];
  for (const raw of input) {
    if (typeof raw !== 'string') {
      return { ok: false, reason: 'Redirect URIs must be strings.' };
    }
    const result = validateRedirectUri(raw);
    if (!result.ok) return result;
    normalized.push(result.normalized);
  }

  // Reject duplicates after normalization. A user that lists the same URI
  // twice probably made a mistake; surface it explicitly.
  const seen = new Set<string>();
  for (const uri of normalized) {
    if (seen.has(uri)) {
      return { ok: false, reason: `Duplicate redirect URI: '${uri}'.` };
    }
    seen.add(uri);
  }

  return { ok: true, normalized };
}

function validateRedirectUri(raw: string): { ok: true; normalized: string } | { ok: false; reason: string } {
  const trimmed = raw.trim();

  if (!trimmed) {
    return { ok: false, reason: 'Redirect URI is required.' };
  }
  if (trimmed.length > MAX_LENGTH) {
    return { ok: false, reason: `Redirect URI is too long (max ${MAX_LENGTH} chars).` };
  }
  if (SPECIAL_TOKENS.has(trimmed)) {
    return {
      ok: false,
      reason: `'${trimmed}' is a wildcard / special token; redirect URIs must be explicit.`,
    };
  }
  if (trimmed.includes('*')) {
    return {
      ok: false,
      reason: 'Wildcards are not supported in redirect URIs — list each URI explicitly.',
    };
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return {
      ok: false,
      reason: `'${trimmed}' is not a valid URL. Expected '<protocol>://<host>[:<port>][/path]'.`,
    };
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return {
      ok: false,
      reason: `Only http:// and https:// are accepted (got '${url.protocol}').`,
    };
  }

  // For http:, only allow localhost / 127.0.0.1 / ::1 (dev). Anything else
  // on http is almost certainly a mistake — public traffic should be https.
  if (url.protocol === 'http:') {
    const host = url.hostname;
    const isLoopback =
      host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1';
    if (!isLoopback) {
      return {
        ok: false,
        reason: `http:// is only allowed for localhost. Use https:// for '${host}'.`,
      };
    }
  }

  // Query strings + fragments don't belong on a registered redirect URI.
  if (url.search) {
    return {
      ok: false,
      reason: `Redirect URI must not have a query string. Drop '${url.search}' from '${trimmed}'.`,
    };
  }
  if (url.hash) {
    return {
      ok: false,
      reason: `Redirect URI must not have a fragment. Drop '${url.hash}' from '${trimmed}'.`,
    };
  }

  // Canonical form: `URL.origin` for protocol/host/port plus the (possibly
  // empty) pathname. We deliberately preserve trailing-slash distinctions
  // because OAuth spec match is exact-string.
  return { ok: true, normalized: url.origin + (url.pathname === '/' ? '' : url.pathname) };
}

const NAME_MIN = 1;
const NAME_MAX = 128;

export function validateClientName(input: string): { ok: true; normalized: string } | { ok: false; reason: string } {
  const trimmed = input.trim();
  if (trimmed.length < NAME_MIN) {
    return { ok: false, reason: 'Name is required.' };
  }
  if (trimmed.length > NAME_MAX) {
    return { ok: false, reason: `Name is too long (max ${NAME_MAX} chars).` };
  }
  return { ok: true, normalized: trimmed };
}
