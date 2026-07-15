/**
 * /api/data-sources/google_drive/restricted-files/[id] — worklist actions.
 *
 * PATCH { action: 'ignore' } — human reviewer removes a restricted file
 * from the scan's re-probe list (status='ignored'). Fixing the file's
 * sharing in Drive is the other exit: the scan resolves the row
 * automatically. Actor derived server-side; audited.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireActor } from '@/lib/actor';

const PatchSchema = z.object({ action: z.literal('ignore') }).strict();

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const actor = await requireActor();
  if ('response' in actor) return actor.response;
  const { actorId } = actor;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.driveRestrictedFile.findUnique({ where: { id: params.id } });
    if (!existing) return { kind: 'not_found' as const };
    if (existing.status !== 'restricted') return { kind: 'not_actionable' as const, status: existing.status };

    const row = await tx.driveRestrictedFile.update({
      where: { id: existing.id },
      data: { status: 'ignored', ignoredBy: actorId },
    });
    await tx.auditLog.create({
      data: {
        action: 'drive_restricted_file_ignored',
        entityType: 'drive_restricted_file',
        entityId: row.id,
        actorId,
        before: { fileId: existing.fileId, name: existing.name, path: existing.path, status: existing.status },
        after: { status: row.status },
      },
    });
    return { kind: 'ignored' as const, row };
  });

  if (result.kind === 'not_found') {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }
  if (result.kind === 'not_actionable') {
    return NextResponse.json({ error: `Row is '${result.status}', not 'restricted'` }, { status: 409 });
  }
  return NextResponse.json({ id: result.row.id, status: result.row.status });
}
