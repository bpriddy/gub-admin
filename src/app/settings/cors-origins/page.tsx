/**
 * /settings/cors-origins — manage the CORS allow-list.
 *
 * The page that the friendly 403 from gcp-universal-backend's
 * originAllowList middleware tells operators to navigate to. Adding an
 * origin here writes a row to cors_allowed_origins; the gcp-universal-
 * backend middleware reads on the next request, so changes take effect
 * within ~hundreds of ms (one round-trip later).
 *
 * SCOPE: dev/staging tooling. See gcp-universal-backend's README
 * "CORS allow-list — dev/staging tooling" for the layer split (this
 * UI vs the production edge CORS that will land alongside the prod
 * environment).
 */

import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { AddOriginForm } from './add-origin-form';
import { OriginActions } from './origin-actions';

export const dynamic = 'force-dynamic';

function formatTime(date: Date): string {
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export default async function CorsOriginsPage() {
  const rows = await prisma.corsAllowedOrigin.findMany({
    orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
  });

  // Batched lookup of staff names for the addedBy column.
  const addedByIds = Array.from(
    new Set(rows.map((r) => r.addedBy).filter((id): id is string => id !== null)),
  );
  const staff = addedByIds.length
    ? await prisma.staff.findMany({
        where: { id: { in: addedByIds } },
        select: { id: true, fullName: true },
      })
    : [];
  const staffById = new Map(staff.map((s) => [s.id, s]));

  const activeCount = rows.filter((r) => r.isActive).length;
  const inactiveCount = rows.length - activeCount;

  return (
    <div className="max-w-5xl">
      <div className="mb-6">
        <Link href="/settings" className="text-sm text-gray-500 hover:text-gray-700">
          &larr; Settings
        </Link>
      </div>

      <div className="mb-2">
        <h1 className="text-xl font-semibold">CORS allow-list</h1>
      </div>
      <p className="text-sm text-gray-500 mb-6 max-w-2xl">
        Origins permitted to make cross-origin requests to GUB. Changes
        take effect on the next request — no redeploy required. When a
        consuming app's origin isn&apos;t on this list, the dev sees a
        structured 403 with the rejected origin and instructions to ask
        an admin (you) to add it here.
      </p>
      <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2 mb-6 max-w-2xl">
        <strong>Dev/staging tooling.</strong> This list governs the
        gcp-universal-backend dev deployment. Production CORS will be
        handled at the edge (planned, not built); see the
        gcp-universal-backend README &quot;CORS allow-list — dev/staging
        tooling&quot; for the architecture and the prod plan.
      </div>

      <div className="mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-2">Add origin</h2>
        <AddOriginForm />
      </div>

      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-gray-700">
          Origins ({activeCount} active{inactiveCount > 0 ? `, ${inactiveCount} inactive` : ''})
        </h2>
      </div>
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Origin</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Label</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Added by</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Added</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  No origins yet. Add one above to get started.
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const addedBy = r.addedBy ? staffById.get(r.addedBy) : null;
              return (
                <tr key={r.id} className={r.isActive ? '' : 'bg-gray-50/50'}>
                  <td className="px-4 py-3 font-mono text-xs text-gray-700 break-all">
                    {r.origin}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {r.label ?? <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        r.isActive
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {r.isActive ? 'active' : 'inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {addedBy?.fullName ?? <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {formatTime(r.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <OriginActions
                      id={r.id}
                      origin={r.origin}
                      label={r.label}
                      isActive={r.isActive}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
