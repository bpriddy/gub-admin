import { prisma } from '@/lib/prisma';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

// Prompt presets are the DB-editable LLM templates (prompt_presets).
// Consumers load the row fresh on every call, so edits saved here are live
// on the next LLM call — no redeploy. Rows are created by GUB migrations;
// this module edits them.
export default async function PromptPresetsPage() {
  const presets = await prisma.promptPreset.findMany({
    orderBy: { key: 'asc' },
    include: { updatedByStaff: { select: { fullName: true } } },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Prompt Presets</h1>
        <span className="text-sm text-gray-400">{presets.length} total</span>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        LLM prompt templates loaded from the database at call time. Edits are live on the next LLM call — including
        scans already in flight. New presets are seeded by GUB migrations.
      </p>
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Key</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Description</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Model</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Temp</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Length</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Active</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Updated</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">By</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {presets.map((p) => (
              <tr key={p.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 whitespace-nowrap">
                  <Link
                    href={`/prompt-presets/${encodeURIComponent(p.key)}`}
                    className="text-blue-600 hover:underline font-mono text-xs"
                  >
                    {p.key}
                  </Link>
                </td>
                <td className="px-4 py-3 text-gray-600 max-w-xs truncate">{p.description ?? '—'}</td>
                <td className="px-4 py-3 text-gray-600 font-mono text-xs whitespace-nowrap">{p.model}</td>
                <td className="px-4 py-3 text-gray-500">{Number(p.temperature).toFixed(2)}</td>
                <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                  {(p.template.length / 1000).toFixed(1)}k chars
                </td>
                <td className="px-4 py-3">
                  {p.isActive ? (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">active</span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">inactive</span>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                  {p.updatedAt.toISOString().split('T')[0]}
                </td>
                <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{p.updatedByStaff?.fullName ?? '—'}</td>
              </tr>
            ))}
            {presets.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                  No prompt presets. Seed them via a GUB migration.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
