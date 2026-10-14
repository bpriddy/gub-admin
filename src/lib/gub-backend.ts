/**
 * gub-backend.ts — server-side calls from gub-admin to the GUB backend,
 * authenticated as gub-admin's Cloud Run runtime service account.
 *
 * The GUB endpoints gub-admin triggers on an operator's click (the
 * directory / groups sync crons, the Drive auto-approve pass) are the same
 * endpoints Cloud Scheduler calls on a timer, and Scheduler presents an
 * OIDC ID token whose audience is the GUB backend URL
 * (gcp-universal-backend terraform/scheduler.tf, `oidc_token.audience =
 * var.backend_service_url`). gub-admin presents the same kind of
 * credential: a Google-signed ID token for its runtime service account,
 * audience = the origin of GUB_BACKEND_URL, so GUB can verify the caller.
 *
 * Minting: the metadata server's identity endpoint with format=full, so
 * the token carries `email` and `email_verified`. Deliberately not
 * google-auth-library's ADC getIdTokenClient(): with a developer's user
 * credentials it mints a token for the developer rather than for a service
 * account, and resolving ADC can shell out to gcloud. One metadata call
 * per GUB call; these are operator clicks, so there is no token cache.
 *
 * Where there is no metadata server (local `next dev`), the request still
 * goes out, WITHOUT an Authorization header, and one
 * `gub.id_token_unavailable` warning is logged per call. A GUB that
 * enforces caller verification answers 401, which the calling route
 * surfaces like any other GUB error.
 *
 * The token is minted for one origin and sent to that origin only:
 * fetchGub refuses a path that would move the request to another host,
 * port or scheme, before anything is minted or sent.
 *
 * The token itself is never logged.
 */

const METADATA_IDENTITY_URL =
  'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity';
const METADATA_TIMEOUT_MS = 3000;

/**
 * Base URL of the GUB backend. Same fallback chain the proxy routes used
 * inline before this helper existed.
 */
export function gubBackendUrl(): string {
  return (
    process.env['GUB_BACKEND_URL'] ?? process.env['NEXT_PUBLIC_GUB_URL'] ?? 'http://localhost:3000'
  );
}

/**
 * Audience of GUB-bound ID tokens: the origin of the backend URL (scheme +
 * host, no path, no trailing slash). On a deployed service this equals the
 * audience Cloud Scheduler uses for the same endpoints.
 */
export function gubIdTokenAudience(baseUrl: string = gubBackendUrl()): string {
  return new URL(baseUrl).origin;
}

/** ID token for the runtime service account. Throws where none can be minted. */
async function mintRuntimeIdToken(audience: string): Promise<string> {
  const url = `${METADATA_IDENTITY_URL}?audience=${encodeURIComponent(audience)}&format=full`;
  const res = await fetch(url, {
    headers: { 'Metadata-Flavor': 'Google' },
    // Never let Next's data cache keep a credential.
    cache: 'no-store',
    signal: AbortSignal.timeout(METADATA_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`metadata server answered ${res.status}`);
  }
  if (res.headers.get('metadata-flavor') !== 'Google') {
    throw new Error('identity response did not come from the metadata server');
  }
  const token = (await res.text()).trim();
  if (token.split('.').length !== 3) {
    throw new Error('metadata server returned no ID token');
  }
  return token;
}

function describeError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  // fetch() wraps network failures as "fetch failed"; the cause carries
  // the useful part (ENOTFOUND when there is no metadata server).
  const code = (err.cause as { code?: unknown } | undefined)?.code;
  return typeof code === 'string' ? `${err.message} (${code})` : err.message;
}

/**
 * `Bearer <ID token>` for the GUB audience, or null when this environment
 * cannot mint one. The null case is logged as a warning and is not an
 * error: the caller sends the request without the header.
 *
 * @param path the GUB path the token is for; only used in the warning line.
 * @param baseUrl the GUB base URL whose origin is the audience; defaults to
 *   the configured one. fetchGub passes the base it sends the request to.
 */
export async function gubAuthorizationHeader(
  path: string,
  baseUrl: string = gubBackendUrl(),
): Promise<string | null> {
  let audience: string | null = null;
  try {
    audience = gubIdTokenAudience(baseUrl);
    return `Bearer ${await mintRuntimeIdToken(audience)}`;
  } catch (err) {
    console.warn(
      JSON.stringify({
        msg: 'gub.id_token_unavailable',
        path,
        audience,
        error: describeError(err),
      }),
    );
    return null;
  }
}

/**
 * fetch() against GUB as gub-admin's runtime service account. `path` is
 * appended to the base URL as-is (leading slash expected), exactly like
 * the inline `${GUB_URL}${endpoint}` calls it replaces. Caller-supplied
 * init and headers are kept (cache defaults to 'no-store'); Authorization
 * is set when a token could be minted.
 *
 * The resulting URL must keep the origin of the GUB base URL, which is the
 * audience the token is minted for. A path that would change the host, port
 * or scheme (for example one without a leading '/') makes this throw before
 * a token is minted or any request is sent. The check parses the exact
 * string that is then fetched, so the two cannot disagree.
 */
export async function fetchGub(path: string, init: RequestInit = {}): Promise<Response> {
  const base = gubBackendUrl();
  let audience: string;
  let url: URL;
  try {
    audience = gubIdTokenAudience(base);
    url = new URL(`${base}${path}`);
  } catch {
    throw new Error('fetchGub: the GUB backend URL and path do not form a valid URL');
  }
  if (url.origin !== audience) {
    throw new Error('fetchGub: path must stay on the GUB backend origin');
  }
  const headers = new Headers(init.headers);
  const authorization = await gubAuthorizationHeader(path, base);
  if (authorization) headers.set('Authorization', authorization);
  return fetch(url.href, { cache: 'no-store', ...init, headers });
}
