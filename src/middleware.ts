import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { resolveDevBypassEmail } from '@/lib/iap-dev-bypass';

/**
 * IAP enforcement middleware.
 * Cloud IAP fronts this app in every deployed environment — this middleware
 * enforces the expected header as defense-in-depth.
 *
 * Local dev bypasses via `resolveDevBypassEmail`, which refuses to activate
 * unless NODE_ENV=development AND the request hostname is localhost
 * (127.0.0.1 / 0.0.0.0 / localhost). The companion startup guard in
 * iap-dev-bypass.ts throws if IAP_DEV_EMAIL is set outside development, so
 * a stray env var on a deployed service can't silently open the admin UI.
 *
 * Public reviewer flows (Drive magic-link reviews etc.) live in the
 * separate `gub-review` service — NOT here. This repo is admin-only.
 */
export function middleware(request: NextRequest) {
  // Use the Host HEADER, not `request.nextUrl.hostname` — Next.js derives
  // `nextUrl.hostname` from the server's bind address (always "localhost"
  // in dev, and the service URL in prod), which makes the handoff's
  // original check a silent no-op. Reading the header directly reflects
  // the actual client-supplied hostname, which is what we want to gate on.
  const host = request.headers.get('host');
  const hostname = host ? (host.split(':')[0] ?? null) : null;
  const devEmail = resolveDevBypassEmail(hostname);
  if (devEmail) {
    return NextResponse.next();
  }

  const iapEmail = request.headers.get('x-goog-authenticated-user-email');
  if (!iapEmail) {
    return new NextResponse('Unauthorized — Cloud IAP authentication required', {
      status: 401,
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
