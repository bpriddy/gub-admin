/**
 * POST /api/research-jobs/enqueue
 *
 * Adds N rows to research_jobs in `queued` status. The trigger surface
 * for both the (eventual) admin UI button and the scripts/queue-deep-
 * research.ts CLI helper.
 *
 * Body: { staffIds: uuid[], provider?, preset?, promptTemplateVersion?, force? }
 *
 * Idempotency: by default, staff IDs that already have a dossier for the
 * same (provider, preset, prompt_template_version) tuple are skipped.
 * Pass `force: true` to enqueue anyway — the next job will UPSERT the
 * existing dossier row.
 *
 * Auth: protected by the same IAP gate as the rest of gub-admin.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { enqueueResearchJobs } from '@/lib/research/enqueue';
import { TALENT_DOSSIER_V1_VERSION } from '@/lib/research/prompt-templates/talent-dossier-v1';

const EnqueueRequest = z
  .object({
    staffIds: z.array(z.string().uuid()).min(1).max(500),
    provider: z.string().default('perplexity_agent'),
    preset: z.enum(['deep-research', 'advanced-deep-research']).default('deep-research'),
    promptTemplateVersion: z.string().default(TALENT_DOSSIER_V1_VERSION),
    force: z.boolean().default(false),
  })
  .strict();

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }
  const parsed = EnqueueRequest.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid request', details: parsed.error.issues },
      { status: 400 },
    );
  }

  const result = await enqueueResearchJobs(parsed.data);
  return NextResponse.json(result);
}
