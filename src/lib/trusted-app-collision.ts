/**
 * trusted-app-collision.ts — cross-row uniqueness guard.
 *
 * The strict same-row pairing semantics in gcp-universal-backend's
 * verifyGoogleToken assume each origin and each google_client_id
 * appears on at most one active trusted_apps row. Two rows that both
 * carry the same origin would create ambiguity ("which row counts as
 * 'the' row for pairing?") and let an operator accidentally widen
 * trust by registering an existing identifier under a different app.
 *
 * This helper surfaces the collision so the route handlers can return
 * 409 with which app already owns the identifier — the operator
 * either merges into the existing entry or picks different values.
 */
import { prisma } from '@/lib/prisma';

export interface TrustedAppCollision {
  id: string;
  name: string;
  conflict:
    | { kind: 'origin'; value: string }
    | { kind: 'google_client_id'; value: string };
}

export async function findCollidingActiveApp(payload: {
  origins: string[];
  googleClientIds: string[];
  excludeId?: string;
}): Promise<TrustedAppCollision | null> {
  const { origins, googleClientIds, excludeId } = payload;
  if (origins.length === 0 && googleClientIds.length === 0) return null;

  const candidates = await prisma.trustedApp.findMany({
    where: {
      isActive: true,
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
      OR: [
        ...(origins.length ? [{ origins: { hasSome: origins } }] : []),
        ...(googleClientIds.length
          ? [{ googleClientIds: { hasSome: googleClientIds } }]
          : []),
      ],
    },
    select: { id: true, name: true, origins: true, googleClientIds: true },
  });

  for (const c of candidates) {
    for (const o of origins) {
      if (c.origins.includes(o)) {
        return { id: c.id, name: c.name, conflict: { kind: 'origin', value: o } };
      }
    }
    for (const id of googleClientIds) {
      if (c.googleClientIds.includes(id)) {
        return {
          id: c.id,
          name: c.name,
          conflict: { kind: 'google_client_id', value: id },
        };
      }
    }
  }
  return null;
}
