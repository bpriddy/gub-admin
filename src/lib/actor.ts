/**
 * actor.ts — Server-side resolution of the acting Staff member.
 *
 * Every write endpoint in gub-admin that records WHO did something (grant
 * created, request reviewed, staff anonymised, etc.) must derive the actor
 * from the IAP-authenticated identity, NOT from the request body. Prior
 * versions accepted `grantedBy` / `revokedBy` / `reviewedByStaffId` /
 * `requestedBy` from the client — any IAP-authenticated user could forge
 * audit entries attributing actions to anyone else.
 *
 * Contract:
 *   - getActorStaffId() reads the IAP email (via getIAPIdentity) and
 *     looks up Staff by email. Throws ActorNotStaffError if the email
 *     has no matching Staff row, or if the Staff row is inactive.
 *   - requireActor() wraps the above for Next.js API route handlers:
 *     returns { actorId } on success, { response } holding a 403 on
 *     ActorNotStaffError. Any other error propagates.
 *
 * Decisions locked here (revisit if they become wrong):
 *   - "active" status is strict. Staff on leave / former / disabled can't
 *     act. If that's too strict for a legitimate case, loosen the check
 *     with intention — don't let it drift.
 *   - An IAP-authenticated user without a Staff record is explicitly 403'd,
 *     not JIT-provisioned. IAP roles don't imply staff membership; if a new
 *     engineer needs to act, provision them a Staff row first.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getIAPIdentity } from '@/lib/iap';

export class ActorNotStaffError extends Error {
  constructor(public readonly email: string, public readonly detail: string) {
    super(`No active staff record for IAP email "${email}" (${detail})`);
    this.name = 'ActorNotStaffError';
  }
}

/**
 * Resolve the authenticated Staff.id from the current IAP identity.
 * Throws ActorNotStaffError if:
 *   - the IAP email has no Staff row, OR
 *   - the matching Staff row is not status='active'.
 */
export async function getActorStaffId(): Promise<string> {
  const { email } = getIAPIdentity();
  const staff = await prisma.staff.findUnique({
    where: { email },
    select: { id: true, status: true },
  });
  if (!staff) throw new ActorNotStaffError(email, 'no staff row');
  if (staff.status !== 'active') {
    throw new ActorNotStaffError(email, `status=${staff.status}`);
  }
  return staff.id;
}

/**
 * API-route helper. Resolves the actor or returns a ready-made 403 response.
 * Usage:
 *
 *   const actor = await requireActor();
 *   if ('response' in actor) return actor.response;
 *   const { actorId } = actor;
 *
 * Keep this call BEFORE any Prisma $transaction block — the lookup doesn't
 * belong inside the transaction and putting it there would hold a DB
 * connection longer than necessary.
 */
export async function requireActor(): Promise<
  { actorId: string } | { response: NextResponse }
> {
  try {
    const actorId = await getActorStaffId();
    return { actorId };
  } catch (err) {
    if (err instanceof ActorNotStaffError) {
      return {
        response: NextResponse.json(
          { error: 'No active staff record for authenticated user' },
          { status: 403 },
        ),
      };
    }
    throw err;
  }
}
