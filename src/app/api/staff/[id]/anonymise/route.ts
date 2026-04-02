import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const AnonymiseSchema = z.object({
  /** staff.id of the administrator processing the DSAR — recorded in audit_log */
  requestedBy: z.string().uuid(),
});

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  }

  const parsed = AnonymiseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { requestedBy } = parsed.data;

  const staff = await prisma.staff.findUnique({
    where: { id: params.id },
    include: { externalIds: true },
  });

  if (!staff) {
    return NextResponse.json({ error: 'Staff member not found' }, { status: 404 });
  }

  // Idempotency guard — do not re-process an already anonymised record
  if (staff.fullName === 'Redacted (GDPR Art. 17)') {
    return NextResponse.json(
      { error: 'This staff record has already been anonymised under GDPR Art. 17' },
      { status: 409 },
    );
  }

  const now = new Date();
  const redactedEmail = `redacted-${staff.id}@gdpr.invalid`;

  const result = await prisma.$transaction(async (tx) => {
    // ── Open the GDPR erasure gate for this transaction ───────────────────────
    // SET LOCAL scopes the flag to this transaction only.
    // It resets automatically on commit or rollback — cannot leak.
    await tx.$executeRaw`SET LOCAL app.gdpr_erasure = 'true'`;

    // ── 1. Anonymise the staff record ─────────────────────────────────────────
    const anonymisedStaff = await tx.staff.update({
      where: { id: params.id },
      data: {
        fullName:   'Redacted (GDPR Art. 17)',
        email:      redactedEmail,
        title:      null,
        department: null,
        status:     'former',
        // Preserve ended_at if already set; default to today if not
        endedAt:    staff.endedAt ?? now,
      },
    });

    // ── 2. Scrub PII from staff_changes ───────────────────────────────────────
    // The trigger gate opened above allows these UPDATEs.
    // We filter on value_is_pii = true — set at write time by okta.sync.ts
    // using the shared STAFF_PII_PROPERTIES constant — so no property name
    // list needs to be maintained here.
    // We overwrite value_text only; all other columns (staffId, property,
    // changedAt, source) remain intact so the audit trail of *when* changes
    // happened is preserved — only *what* they contained is erased.
    await tx.$executeRaw`
      UPDATE staff_changes
      SET    value_text = '[GDPR REDACTED]'
      WHERE  staff_id   = ${params.id}::uuid
        AND  value_is_pii = true
        AND  value_text IS NOT NULL
    `;

    // ── 3. Delete external identity mappings (Okta ID, etc.) ─────────────────
    // These are unique identifiers for the person — primary PII.
    // Nothing else in the schema references staff_external_ids rows directly.
    await tx.staffExternalId.deleteMany({
      where: { staffId: params.id },
    });

    // ── 4. Revoke all sessions and access for the linked platform user ────────
    if (staff.userId) {
      // Terminate all active sessions
      await tx.refreshToken.updateMany({
        where: { userId: staff.userId, revokedAt: null },
        data:  { revokedAt: now },
      });

      // Revoke all active access grants — former employees should have no access
      await tx.accessGrant.updateMany({
        where: { userId: staff.userId, revokedAt: null },
        data:  { revokedAt: now, revokedBy: requestedBy },
      });
    }

    // ── 5. Audit log entry ────────────────────────────────────────────────────
    // Records the legal basis, who processed the request, and what was erased.
    // audit_log is append-only; the immutability trigger only blocks UPDATE/DELETE.
    await tx.auditLog.create({
      data: {
        action:     'staff_anonymised',
        entityType: 'staff',
        entityId:   params.id,
        actorId:    requestedBy,
        before: {
          fullName:   staff.fullName,
          email:      staff.email,
          title:      staff.title,
          department: staff.department,
          status:     staff.status,
          externalIdCount: staff.externalIds.length,
        },
        after: {
          fullName:   'Redacted (GDPR Art. 17)',
          email:      redactedEmail,
          title:      null,
          department: null,
          status:     'former',
        },
        metadata: {
          legalBasis:          'GDPR Art. 17 — Right to erasure',
          staffChangesScrubbedBy: 'value_is_pii = true',
          linkedUserId:        staff.userId ?? null,
          sessionsRevoked:     staff.userId !== null,
          accessGrantsRevoked: staff.userId !== null,
        },
      },
    });

    return anonymisedStaff;
  });

  return NextResponse.json(result);
}
