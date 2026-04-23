/**
 * iap-dev-bypass.ts — Gated IAP bypass for local development only.
 *
 * Cloud IAP fronts gub-admin in every deployed environment. For local dev we
 * need to shortcut past IAP — but the bypass MUST NOT fire anywhere else,
 * and it must not fire silently. The single historical guard (`if
 * IAP_DEV_EMAIL`) would open the admin UI to the internet as that email if
 * the env var ever slipped into a deploy.
 *
 * Three layers, all required:
 *   1. `NODE_ENV === 'development'`  (strict — no "!== 'production'" fallback)
 *   2. Request hostname is localhost / 127.0.0.1 / 0.0.0.0
 *   3. Startup guard — if `IAP_DEV_EMAIL` is set outside development, the
 *      module throws at import time. The server refuses to boot.
 *
 * Plus a console.warn on first bypass in a running process so anyone
 * tailing local logs can see the bypass is engaged.
 *
 * NOT called from middleware and server helpers directly — goes through
 * `resolveDevBypassEmail(hostname)`. Two call sites:
 *   - src/middleware.ts (Edge runtime; uses request.nextUrl.hostname)
 *   - src/lib/iap.ts    (Node runtime; uses headers().get('host'))
 * The logic lives here so both paths are identical and can't drift.
 */

const DEV_EMAIL = process.env['IAP_DEV_EMAIL'];
const IS_DEV = process.env['NODE_ENV'] === 'development';

// Startup guard. If the bypass env var is set but we're not in development,
// the module throws at load time — which in Next.js bubbles up on the first
// request to the middleware / server component that imports it. Loud failure
// is better than a silent wide-open admin UI.
if (DEV_EMAIL && !IS_DEV) {
  throw new Error(
    `IAP_DEV_EMAIL is set but NODE_ENV is "${process.env['NODE_ENV'] ?? 'undefined'}". ` +
      `This bypass is development-only. Unset IAP_DEV_EMAIL, or set NODE_ENV=development.`,
  );
}

let warned = false;
function warnOnce(hostname: string): void {
  if (warned) return;
  warned = true;
  // Intentional console.warn (not a pino logger) — we want this to surface
  // regardless of log configuration, including when server is starting up.

  console.warn(
    `[IAP BYPASS ACTIVE] IAP_DEV_EMAIL=${DEV_EMAIL} is bypassing auth on ${hostname}. ` +
      `This must only happen in local development.`,
  );
}

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0']);

/**
 * Returns the bypass email if and only if all three conditions hold:
 *   - NODE_ENV === 'development'
 *   - IAP_DEV_EMAIL is set
 *   - hostname is in the local allowlist
 *
 * Any other case returns null — callers must then enforce normal IAP auth.
 */
export function resolveDevBypassEmail(hostname: string | null): string | null {
  if (!IS_DEV || !DEV_EMAIL) return null;
  if (!hostname) return null;
  if (!LOCAL_HOSTNAMES.has(hostname.toLowerCase())) return null;
  warnOnce(hostname);
  return DEV_EMAIL;
}
