import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { enqueueResearchJobs } from '@/lib/research/enqueue';

/**
 * Maps data source keys to their backend sync trigger endpoints.
 * Only sources with an active sync engine are listed here.
 *
 * Note on perplexity_deep_research: unlike the Google syncs (which proxy
 * to GUB), this one is fully in-gub-admin — the trigger calls our own
 * /api/research-jobs/enqueue route directly with the full active-staff
 * list. The body shape there differs from the Google `cron` endpoints,
 * so it cannot share this map and is handled by a special-case below.
 */
const SYNC_ENDPOINTS: Record<string, string> = {
  google_directory: '/integrations/google-directory/cron',
  google_groups: '/integrations/google-groups/cron',
  // Note: the Drive endpoint on the backend is `authenticate + requireAdmin`;
  // google-directory/cron is unauthenticated. Until that inconsistency is
  // resolved (shared secret, service-to-service IAM, or dropping auth to
  // match), triggering Drive from this proxy will 401. Flagged as an open
  // item — see DriveSync plan memory.
  google_drive: '/integrations/google-drive/run-full-sync',
};

/** Data source keys handled internally by gub-admin (not proxied to GUB). */
const INTERNAL_SOURCES = new Set(['perplexity_deep_research']);

const GUB_URL = process.env['GUB_BACKEND_URL'] ?? process.env['NEXT_PUBLIC_GUB_URL'] ?? 'http://localhost:3000';

export async function POST(_request: Request, { params }: { params: { key: string } }) {
  const source = await prisma.dataSource.findUnique({ where: { key: params.key } });
  if (!source) {
    return NextResponse.json({ error: 'Data source not found' }, { status: 404 });
  }

  // In-gub-admin sources: enqueue research jobs for every active staff
  // member with no current dossier. The worker (Cloud-Scheduler-fired
  // process-next route) does the actual work.
  if (INTERNAL_SOURCES.has(params.key)) {
    if (params.key === 'perplexity_deep_research') {
      const activeStaff = await prisma.staff.findMany({
        where: { status: 'active' },
        select: { id: true },
      });
      const result = await enqueueResearchJobs({ staffIds: activeStaff.map((s) => s.id) });
      return NextResponse.json({ status: 'triggered', ...result });
    }
    return NextResponse.json({ error: 'unhandled internal source' }, { status: 500 });
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

