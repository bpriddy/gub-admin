/**
 * grant-policy-labels.ts — display names for the records a grant policy and
 * its preview point at (accounts, campaigns, offices, teams). Server-side:
 * one batched query per record kind.
 */

import { prisma } from '@/lib/prisma';
import type { TargetKind } from '@/lib/grant-policy';

/** Which record kind a grant's or policy's resource_id points at, for a resource type. */
export function targetKindOf(resourceType: string): TargetKind | null {
  switch (resourceType) {
    case 'account':
    case 'account_tree':
      return 'account';
    case 'campaign':
      return 'campaign';
    case 'office':
    case 'staff_office':
      return 'office';
    case 'team':
    case 'staff_team':
      return 'team';
    default:
      return null;
  }
}

export interface ResourceRef {
  resourceType: string;
  resourceId: string | null;
}

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

function nameKey(kind: TargetKind, id: string): string {
  return `${kind}:${id.toLowerCase()}`;
}

/** Names for every referenced record that still exists. Look results up with resourceName(). */
export async function lookupResourceNames(refs: ResourceRef[]): Promise<Map<string, string>> {
  const ids: Record<TargetKind, Set<string>> = {
    account: new Set(),
    campaign: new Set(),
    office: new Set(),
    team: new Set(),
  };
  for (const ref of refs) {
    const kind = targetKindOf(ref.resourceType);
    // The nil UUID is the table-level sentinel; anything that is not a UUID would
    // make the database reject the whole query.
    if (kind && ref.resourceId && ref.resourceId !== NIL_UUID && GUID.test(ref.resourceId)) {
      ids[kind].add(ref.resourceId);
    }
  }

  const names = new Map<string, string>();
  const [accounts, campaigns, offices, teams] = await Promise.all([
    ids.account.size
      ? prisma.account.findMany({
          where: { id: { in: Array.from(ids.account) } },
          select: { id: true, name: true },
        })
      : [],
    ids.campaign.size
      ? prisma.campaign.findMany({
          where: { id: { in: Array.from(ids.campaign) } },
          select: { id: true, name: true },
        })
      : [],
    ids.office.size
      ? prisma.office.findMany({
          where: { id: { in: Array.from(ids.office) } },
          select: { id: true, name: true },
        })
      : [],
    ids.team.size
      ? prisma.team.findMany({
          where: { id: { in: Array.from(ids.team) } },
          select: { id: true, name: true },
        })
      : [],
  ]);
  for (const r of accounts) names.set(nameKey('account', r.id), r.name);
  for (const r of campaigns) names.set(nameKey('campaign', r.id), r.name);
  for (const r of offices) names.set(nameKey('office', r.id), r.name);
  for (const r of teams) names.set(nameKey('team', r.id), r.name);
  return names;
}

/** The looked-up name of a ref's record, or null (no resource, table-level, or deleted). */
export function resourceName(names: Map<string, string>, ref: ResourceRef): string | null {
  const kind = targetKindOf(ref.resourceType);
  if (!kind || !ref.resourceId) return null;
  return names.get(nameKey(kind, ref.resourceId)) ?? null;
}
