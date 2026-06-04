import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { enqueueResearchJobs } from '@/lib/research/enqueue';
import { triggerDriveSyncJob, TriggerJobError } from '@/lib/drive-sync/trigger-job';

/**
 * Maps data source keys to their backend sync trigger endpoints.
 * Only sources still proxied via HTTP to GUB are listed here.
 *
 * Notes:
 *   - perplexity_deep_research: handled in-gub-admin via the
 *     INTERNAL_SOURCES branch below — enqueueResearchJobs() inserts
 *     research_jobs and fires the gub-research-worker Cloud Run Job via
 *     the Admin API.
 *   - google_drive: handled in-gub-admin via the INTERNAL_SOURCES branch
 *     below — fires the gub-drive-sync Cloud Run Job via the Admin API
 *     (mode=run-full-sync). No HTTP, no GUB hop. The reviewer-facing
 *     /review endpoints stay in GUB, but they're not on this trigger
 *     surface.
 */
const SYNC_ENDPOINTS: Record<string, string> = {
  google_directory: '/integrations/google-directory/cron',
  google_groups: '/integrations/google-groups/cron',
};

/** Data source keys handled internally by gub-admin (not proxied to GUB). */
const INTERNAL_SOURCES = new Set(['perplexity_deep_research', 'google_drive']);

const GUB_URL = process.env['GUB_BACKEND_URL'] ?? process.env['NEXT_PUBLIC_GUB_URL'] ?? 'http://localhost:3000';

export async function POST(_request: Request, { params }: { params: { key: string } }) {
  const source = await prisma.dataSource.findUnique({ where: { key: params.key } });
  if (!source) {
    return NextResponse.json({ error: 'Data source not found' }, { status: 404 });
  }

  // In-gub-admin sources: trigger a Cloud Run Job via the Admin API. No
  // HTTP to GUB; no IAP traversal (we are behind IAP; the Admin API is
  // IAM-gated, not IAP-gated). The Job runs without a user session.
  if (INTERNAL_SOURCES.has(params.key)) {
    if (params.key === 'perplexity_deep_research') {
      const activeStaff = await prisma.staff.findMany({
        where: { status: 'active' },
        select: { id: true },
      });
      const result = await enqueueResearchJobs({ staffIds: activeStaff.map((s) => s.id) });
      return NextResponse.json({ status: 'triggered', ...result });
    }
    if (params.key === 'google_drive') {
      try {
        await triggerDriveSyncJob({ mode: 'run-full-sync' });
        return NextResponse.json({ status: 'triggered', mode: 'run-full-sync' });
      } catch (err) {
        const detail =
          err instanceof TriggerJobError ? err.message : (err as Error).message;
        return NextResponse.json(
          { error: 'Failed to trigger gub-drive-sync Job', detail },
          { status: 502 },
        );
      }
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

