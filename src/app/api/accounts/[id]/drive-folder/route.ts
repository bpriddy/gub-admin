/**
 * PATCH /api/accounts/[id]/drive-folder
 *
 * Update an account's drive_folder_id. Conceptually part of the Data
 * Sources / Drive Sync workflow — the column happens to live on the
 * accounts table for historical-row reasons, but operationally it's a
 * sync-integration property.
 *
 * Request body:
 *   { driveFolderId: string | null }
 *
 * Response (200):
 *   { id, driveFolderId }
 *
 * Errors:
 *   400 — malformed body
 *   403 — actor not in staff
 *   404 — account doesn't exist
 *
 * Note: we don't (yet) validate that the bot user has read access to
 * the supplied folder. That's a Phase 2 enhancement — for now the
 * operator owns getting the ID right, and a failed backfill scan
 * surfaces the access error directly. See open task on folder
 * access validation.
 *
 * Audit: writes an account_changes row attributing the change to the
 * acting staff member, mirroring the pattern used by other writable
 * account fields.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireActor } from '@/lib/actor';

const BodySchema = z.object({
  driveFolderId: z.string().min(1).max(200).nullable(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const actor = await requireActor();
  if ('response' in actor) return actor.response;

  let body: z.infer<typeof BodySchema>;
  try {
    const json = await req.json();
    body = BodySchema.parse(json);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Invalid request body' },
      { status: 400 },
    );
  }

  const current = await prisma.account.findUnique({
    where: { id: params.id },
    select: { id: true, driveFolderId: true },
  });
  if (!current) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  }
  if (current.driveFolderId === body.driveFolderId) {
    // No-op — return current state without writing.
    return NextResponse.json(current);
  }

  const next = await prisma.$transaction(async (tx) => {
    const updated = await tx.account.update({
      where: { id: params.id },
      data: { driveFolderId: body.driveFolderId },
      select: { id: true, driveFolderId: true },
    });
    // gub-admin's slim AccountChange model exposes only the `value_*`
    // columns. The DB has `previous_value_text` (used by Drive review),
    // but it's not surfaced in this client. Writing the new value alone
    // is sufficient — readers reconstruct previous from the prior row.
    await tx.accountChange.create({
      data: {
        accountId: params.id,
        property: 'drive_folder_id',
        valueText: body.driveFolderId,
        changedBy: actor.actorId,
      },
    });
    return updated;
  });

  return NextResponse.json(next);
}
