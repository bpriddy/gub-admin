/**
 * cors-origin-validation.ts — guard rails for the CORS allow-list editor.
 *
 * The allow-list is dev-tooling defense-in-depth (gcp-universal-backend
 * README "CORS allow-list — dev/staging tooling"), but a sloppy entry
 * here can still defeat its purpose. The validation here makes
 * "obvious foot-gun" entries impossible to save:
 *
 *   - No wildcards or special tokens. `*`, `null`, `allUsers`,
 *     `allAuthenticatedUsers` — all rejected. The whole point of the
 *     allow-list is explicit registration.
 *   - URL-shaped, not path-shaped. An origin is `<protocol>://<host>[:<port>]`
 *     — no path, no query, no fragment. `https://app.example.com/foo`
 *     gets rejected with a hint that the path part should be dropped.
 *   - Sane protocols only (`http:` for localhost, `https:` for everything
 *     else). `data:`, `file:`, `chrome-extension:` etc. are rejected.
 *   - Length cap at 256 chars (URLs longer than that are almost
 *     certainly errors).
 *
 * Returns either { ok: true, normalized } where `normalized` is the
 * canonical form to persist, or { ok: false, reason } with a message
 * suitable for surfacing back to the operator.
 */

const SPECIAL_TOKENS = new Set(['*', 'null', 'allUsers', 'allAuthenticatedUsers']);
const MAX_LENGTH = 256;

export type ValidationResult =
  | { ok: true; normalized: string }
  | { ok: false; reason: string };

export function validateCorsOrigin(input: string): ValidationResult {
  const trimmed = input.trim();

  if (!trimmed) {
    return { ok: false, reason: 'Origin is required.' };
  }
  if (trimmed.length > MAX_LENGTH) {
    return { ok: false, reason: `Origin is too long (max ${MAX_LENGTH} chars).` };
  }
  if (SPECIAL_TOKENS.has(trimmed)) {
    return {
      ok: false,
      reason: `'${trimmed}' is a wildcard / special token; the allow-list requires explicit origins only.`,
    };
  }
  if (trimmed.includes('*')) {
    return {
      ok: false,
      reason: 'Wildcards are not supported — list each origin explicitly.',
    };
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return {
      ok: false,
      reason: `'${trimmed}' is not a valid URL. Expected '<protocol>://<host>[:<port>]'.`,
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
    const isLoopback = host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1';
    if (!isLoopback) {
      return {
        ok: false,
        reason: `http:// is only allowed for localhost. Use https:// for '${host}'.`,
      };
    }
  }

  // Origins are <protocol>://<host>[:<port>] — nothing else. Reject path,
  // query, fragment.
  if (url.pathname !== '/' && url.pathname !== '') {
    return {
      ok: false,
      reason: `Origin must not have a path. Drop '${url.pathname}' from '${trimmed}'.`,
    };
  }
  if (url.search) {
    return {
      ok: false,
      reason: `Origin must not have a query string. Drop '${url.search}' from '${trimmed}'.`,
    };
  }
  if (url.hash) {
    return {
      ok: false,
      reason: `Origin must not have a fragment. Drop '${url.hash}' from '${trimmed}'.`,
    };
  }

  // Canonical form: protocol + host + (optional) port. No trailing slash —
  // `URL.origin` does the right thing here.
  return { ok: true, normalized: url.origin };
}
