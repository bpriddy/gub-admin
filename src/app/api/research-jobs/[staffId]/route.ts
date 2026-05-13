/**
 * GET /api/research-jobs/[staffId]
 *
 * Read-only status view for a single staff member. Returns:
 *   - the most-recent job (any status) for context
 *   - all current dossiers (one per provider/preset/prompt_version tuple)
 *
 * Used by the (future) per-staff admin page and by the ingestion script
 * to verify a backfill landed.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';

const ParamSchema = z.object({ staffId: z.string().uuid() });

export async function GET(
  _request: Request,
  { params }: { params: { staffId: string } },
) {
  const parsed = ParamSchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid staffId' }, { status: 400 });
  }

  const staffId = parsed.data.staffId;

  const [latestJob, dossiers] = await Promise.all([
    prisma.researchJob.findFirst({
      where: { staffId },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.staffResearchDossier.findMany({
      where: { staffId },
      orderBy: { generatedAt: 'desc' },
    }),
  ]);

  return NextResponse.json({ latestJob, dossiers });
}
