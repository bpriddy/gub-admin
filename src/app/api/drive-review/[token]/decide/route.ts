import { NextResponse } from 'next/server';

/**
 * Proxy for POST /integrations/google-drive/review/:token/decide.
 *
 * Body is passed through verbatim — the backend owns validation and returns
 * per-item errors in the response `errors[]` array. We don't try to
 * pre-validate here; that would be two sources of truth.
 */

const GUB_URL =
  process.env['GUB_BACKEND_URL'] ??
  process.env['NEXT_PUBLIC_GUB_URL'] ??
  'http://localhost:3000';

export async function POST(request: Request, { params }: { params: { token: string } }) {
  const { token } = params;
  if (!token) {
    return NextResponse.json({ error: 'Missing review token' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  try {
    const res = await fetch(
      `${GUB_URL}/integrations/google-drive/review/${encodeURIComponent(token)}/decide`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );
    const responseBody = await res.text();
    const contentType = res.headers.get('content-type') ?? 'application/json';
    return new NextResponse(responseBody, {
      status: res.status,
      headers: { 'content-type': contentType },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to reach GUB backend', detail: message },
      { status: 502 },
    );
  }
}
