import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * IAP enforcement middleware.
 * In production, Cloud IAP ensures only authorized users reach the app.
 * This middleware enforces the header is present as a defense-in-depth check.
 * In local dev, IAP_DEV_EMAIL bypasses this.
 */
export function middleware(request: NextRequest) {
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
