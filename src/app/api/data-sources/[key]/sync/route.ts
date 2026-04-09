import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * Maps data source keys to their backend sync trigger endpoints.
 * Only sources with an active sync engine are listed here.
 */
const SYNC_ENDPOINTS: Record<string, string> = {
  google_directory: '/integrations/google-directory/cron',
};

const GUB_URL = process.env['NEXT_PUBLIC_GUB_URL'] ?? 'http://localhost:3000';

export async function POST(_request: Request, { params }: { params: { key: string } }) {
  const source = await prisma.dataSource.findUnique({ where: { key: params.key } });
  if (!source) {
    return NextResponse.json({ error: 'Data source not found' }, { status: 404 });
  }

  const endpoint = SYNC_ENDPOINTS[params.key];
  if (!endpoint) {
    return NextResponse.json({ error: 'Sync not available for this source' }, { status: 400 });
  }

  try {
    const res = await fetch(`${GUB_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: 'Backend sync trigger failed', detail: text },
        { status: res.status },
      );
    }

    const data = await res.json();
    return NextResponse.json({ status: 'triggered', ...data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to reach backend', detail: message },
      { status: 502 },
    );
  }
}
