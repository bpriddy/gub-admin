import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Paths that are intentionally public (no IAP required).
 *
 * Drive review magic-link pages: the URL token IS the credential. Reviewers
 * click an email link and may not be signed into their Workspace account in
 * that browser. The backend review endpoints are also public (token-auth)
 * for the same reason — adding IAP here would force reviewers to also be
 * Google-signed-in, which defeats the point of an emailed link.
 *
 * The matching API proxy routes (/api/drive-review/*) are also listed so
 * the same reviewer can submit decisions from the same session.
 */
const PUBLIC_PATH_PREFIXES = ['/drive-review/', '/api/drive-review/'];

/**
 * IAP enforcement middleware.
 * In production, Cloud IAP ensures only authorized users reach the app.
 * This middleware enforces the header is present as a defense-in-depth check.
 * In local dev, IAP_DEV_EMAIL bypasses this.
 */
export function middleware(request: NextRequest) {
  // Public routes — magic-link review pages authenticate via URL token.
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  // Local dev bypass
  if (process.env.IAP_DEV_EMAIL) {
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
