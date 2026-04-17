import { NextResponse } from 'next/server';

/**
 * Proxy for GET /integrations/google-drive/review/:token on the GUB backend.
 *
 * The backend route is public (token-authenticated). We proxy through Next
 * to keep the GUB URL server-side and to present a unified origin to the
 * reviewer's browser (avoids CORS + keeps the admin UI feeling like one
 * coherent service).
 */

const GUB_URL =
  process.env['GUB_BACKEND_URL'] ??
  process.env['NEXT_PUBLIC_GUB_URL'] ??
  'http://localhost:3000';

export async function GET(_request: Request, { params }: { params: { token: string } }) {
  const { token } = params;
  if (!token) {
    return NextResponse.json({ error: 'Missing review token' }, { status: 400 });
  }

  try {
    const res = await fetch(
      `${GUB_URL}/integrations/google-drive/review/${encodeURIComponent(token)}`,
      { method: 'GET', cache: 'no-store' },
    );
    const body = await res.text();
    // Pass through the backend's status + JSON body verbatim. Content-Type
    // should be application/json — if the backend returned something else
    // we still pass it through as text so we don't mask debugging info.
    const contentType = res.headers.get('content-type') ?? 'application/json';
    return new NextResponse(body, { status: res.status, headers: { 'content-type': contentType } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to reach GUB backend', detail: message },
      { status: 502 },
    );
  }
}
