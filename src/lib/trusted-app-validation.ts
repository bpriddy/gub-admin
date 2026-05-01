/**
 * trusted-app-validation.ts — guard rails for the trusted_apps registry
 * editor. Validates the shape of each identifier on a row:
 *
 *   - origins[]:           CORS origins. Same rules as the legacy CORS
 *                          allow-list — `<protocol>://<host>[:<port>]`
 *                          only, no paths/queries/fragments. https
 *                          everywhere except loopback hosts. No wildcards.
 *
 *   - googleClientIds[]:   Google OAuth 2.0 client IDs. Format:
 *                          `<digits>-<random>.apps.googleusercontent.com`.
 *                          The Google docs allow a few variants but the
 *                          canonical issued shape is the *.apps.google
 *                          usercontent.com suffix; we enforce that here
 *                          rather than accepting any string.
 *
 * Each row also has a `name` (free-form, but length-bounded). The whole
 * row must have at least one origin OR one client_id — an empty row
 * doesn't gate anything and is almost certainly a save-by-mistake. We
 * still allow rows that have only origins (CORS-only) or only client_ids
 * (audience-only, e.g. the auto-seeded GUB-self row), so the same-table
 * representation supports both pure-CORS and pure-audience entries.
 */

const SPECIAL_TOKENS = new Set(['*', 'null', 'allUsers', 'allAuthenticatedUsers']);
const ORIGIN_MAX_LENGTH = 256;
const CLIENT_ID_MAX_LENGTH = 256;
const NAME_MAX_LENGTH = 200;
const MAX_ORIGINS = 25;
const MAX_CLIENT_IDS = 25;

const GOOGLE_CLIENT_ID_PATTERN = /^[0-9]+-[A-Za-z0-9_]+\.apps\.googleusercontent\.com$/;

export type ValidationOk<T> = { ok: true; normalized: T };
export type ValidationErr = { ok: false; reason: string };
export type ValidationResult<T> = ValidationOk<T> | ValidationErr;

export interface TrustedAppInput {
  name: string;
  origins: string[];
  googleClientIds: string[];
}

export interface TrustedAppNormalized {
  name: string;
  origins: string[];
  googleClientIds: string[];
}

/**
 * Validate a complete trusted-app draft (POST or PATCH body). Returns
 * the normalized form ready to persist, or a single human-readable
 * reason on first failure (the UI shows this verbatim).
 */
export function validateTrustedApp(input: TrustedAppInput): ValidationResult<TrustedAppNormalized> {
  const nameResult = validateName(input.name);
  if (!nameResult.ok) return nameResult;

  const originsResult = validateOrigins(input.origins);
  if (!originsResult.ok) return originsResult;

  const idsResult = validateGoogleClientIds(input.googleClientIds);
  if (!idsResult.ok) return idsResult;

  if (originsResult.normalized.length === 0 && idsResult.normalized.length === 0) {
    return {
      ok: false,
      reason:
        'A trusted app must have at least one origin or one Google client_id. ' +
        'Empty rows do not gate any traffic and are almost certainly a save-by-mistake.',
    };
  }

  return {
    ok: true,
    normalized: {
      name: nameResult.normalized,
      origins: originsResult.normalized,
      googleClientIds: idsResult.normalized,
    },
  };
}

function validateName(input: string): ValidationResult<string> {
  const trimmed = (input ?? '').trim();
  if (trimmed.length === 0) {
    return { ok: false, reason: 'Name is required.' };
  }
  if (trimmed.length > NAME_MAX_LENGTH) {
    return { ok: false, reason: `Name is too long (max ${NAME_MAX_LENGTH} chars).` };
  }
  return { ok: true, normalized: trimmed };
}

export function validateOrigin(input: string): ValidationResult<string> {
  const trimmed = (input ?? '').trim();

  if (!trimmed) {
    return { ok: false, reason: 'Origin is required.' };
  }
  if (trimmed.length > ORIGIN_MAX_LENGTH) {
    return { ok: false, reason: `Origin is too long (max ${ORIGIN_MAX_LENGTH} chars).` };
  }
  if (SPECIAL_TOKENS.has(trimmed)) {
    return {
      ok: false,
      reason: `'${trimmed}' is a wildcard / special token; origins must be explicit.`,
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

  return { ok: true, normalized: url.origin };
}

function validateOrigins(input: string[]): ValidationResult<string[]> {
  if (!Array.isArray(input)) {
    return { ok: false, reason: 'Origins must be an array of strings.' };
  }
  if (input.length > MAX_ORIGINS) {
    return { ok: false, reason: `Too many origins (max ${MAX_ORIGINS} per app).` };
  }

  const normalized: string[] = [];
  for (const raw of input) {
    if (typeof raw !== 'string') {
      return { ok: false, reason: 'Origins must be strings.' };
    }
    const trimmed = raw.trim();
    if (!trimmed) continue; // skip blank lines from textarea input
    const result = validateOrigin(trimmed);
    if (!result.ok) return result;
    if (!normalized.includes(result.normalized)) {
      normalized.push(result.normalized);
    }
  }
  return { ok: true, normalized };
}

export function validateGoogleClientId(input: string): ValidationResult<string> {
  const trimmed = (input ?? '').trim();

  if (!trimmed) {
    return { ok: false, reason: 'Google client_id is required.' };
  }
  if (trimmed.length > CLIENT_ID_MAX_LENGTH) {
    return {
      ok: false,
      reason: `Google client_id is too long (max ${CLIENT_ID_MAX_LENGTH} chars).`,
    };
  }
  if (!GOOGLE_CLIENT_ID_PATTERN.test(trimmed)) {
    return {
      ok: false,
      reason:
        `'${trimmed}' isn't a valid Google OAuth client_id. ` +
        `Expected the form '<digits>-<random>.apps.googleusercontent.com' (the value Google issues in the OAuth client console).`,
    };
  }
  return { ok: true, normalized: trimmed };
}

function validateGoogleClientIds(input: string[]): ValidationResult<string[]> {
  if (!Array.isArray(input)) {
    return { ok: false, reason: 'Google client_ids must be an array of strings.' };
  }
  if (input.length > MAX_CLIENT_IDS) {
    return {
      ok: false,
      reason: `Too many Google client_ids (max ${MAX_CLIENT_IDS} per app).`,
    };
  }

  const normalized: string[] = [];
  for (const raw of input) {
    if (typeof raw !== 'string') {
      return { ok: false, reason: 'Google client_ids must be strings.' };
    }
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const result = validateGoogleClientId(trimmed);
    if (!result.ok) return result;
    if (!normalized.includes(result.normalized)) {
      normalized.push(result.normalized);
    }
  }
  return { ok: true, normalized };
}
