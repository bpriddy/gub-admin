import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { RunDuration } from '../../run-duration';

export const dynamic = 'force-dynamic';

const SOURCE_LABELS: Record<string, string> = {
  google_directory: 'Google Directory',
  workfront: 'Workfront',
  google_drive: 'Google Drive',
};

interface SkipEntry {
  email: string;
  name: string;
  reason: string;
  detail: string;
  /** Which layer decided — 'hard_filter' | 'llm' | 'sync_rule'. */
  source?: 'hard_filter' | 'llm' | 'sync_rule';
  /** 0–1 when source='llm'. */
  confidence?: number;
}

interface ChangeEntry {
  email: string;
  name: string;
  action: 'created' | 'updated';
  changes?: { property: string; from: string | null; to: string | null }[];
}

interface ErrorEntry {
  email: string;
  name: string;
  error: string;
}

interface ClassifierAudit {
  totalInput: number;
  syncRuleHits: number;
  hardFilterSkips: number;
  llmInputs: number;
  llmBatches: number;
  llmRetries: number;
  llmFallbacks: number;
  llmDurationMs: number;
  llmKeptAsPerson: number;
  llmSkippedAsService: number;
  llmKept: Array<{ email: string; reason: string; confidence: number }>;
}

interface SyncDetails {
  skipped?: SkipEntry[];
  changes?: ChangeEntry[];
  errors?: ErrorEntry[];
  classifier?: ClassifierAudit;
}

function groupBy<T>(items: T[], keyFn: (item: T) => string): Record<string, T[]> {
  const result: Record<string, T[]> = {};
  for (const item of items) {
    const key = keyFn(item);
    (result[key] ??= []).push(item);
  }
  return result;
}

const REASON_LABELS: Record<string, string> = {
  service_account: 'Group / Service Accounts',
  external_domain: 'External Domain',
  no_reply: 'No-Reply Addresses',
  newsletter: 'Newsletter / Automated Senders',
  unmappable: 'Unmappable (missing name or email)',
};

export default async function SyncRunDetailPage({ params }: { params: { key: string; id: string } }) {
  const run = await prisma.syncRun.findUnique({ where: { id: params.id } });

  if (!run) return notFound();

  const details = (run.details ?? {}) as SyncDetails;
  const skipped = details.skipped ?? [];
  const changes = details.changes ?? [];
  const errors = details.errors ?? [];
  const classifier = details.classifier;
  const skipsByReason = groupBy(skipped, (s) => s.reason);

  // For the Kept section: sort by confidence ASC so the model's least-certain
  // 'person' decisions float to the top — those are the candidates for a
  // future sync_rules override.
  const kept = classifier?.llmKept
    ? [...classifier.llmKept].sort((a, b) => a.confidence - b.confidence)
    : [];

  const sourceLabel = SOURCE_LABELS[run.source] ?? run.source;

  return (
    <div>
      <div className="mb-6">
        <Link href={`/data-sources/${params.key}`} className="text-sm text-gray-500 hover:text-gray-700">
          &larr; Back to {sourceLabel}
        </Link>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">{sourceLabel} Sync</h1>
          <p className="text-sm text-gray-500 mt-1 flex items-center gap-2">
            <span>
              {run.startedAt.toLocaleString('en-US', {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </span>
            <span className="text-gray-400">·</span>
            <RunDuration
              startedAt={run.startedAt.toISOString()}
              durationMs={run.durationMs}
              status={run.status}
              className="text-gray-400"
            />
          </p>
        </div>
        <span
          className={`text-xs px-2.5 py-1 rounded-full font-medium ${
            run.status === 'success'
              ? 'bg-green-100 text-green-700'
              : run.status === 'failed'
                ? 'bg-red-100 text-red-700'
                : 'bg-amber-100 text-amber-700'
          }`}
        >
          {run.status}
        </span>
      </div>

      {/* Prominent duration — ticks live while running, stays as a record
          of the completion time once done. Placed above the counters so
          the user can't miss it on a long-running sync. */}
      <RunDuration
        startedAt={run.startedAt.toISOString()}
        durationMs={run.durationMs}
        status={run.status}
        size="big"
      />

      {/* Counters */}
      <div className="grid grid-cols-6 gap-3 mb-8">
        {[
          { label: 'Scanned', value: run.totalScanned, color: 'text-gray-900' },
          { label: 'Created', value: run.created, color: 'text-green-700' },
          { label: 'Updated', value: run.updated, color: 'text-blue-700' },
          { label: 'Unchanged', value: run.unchanged, color: 'text-gray-400' },
          { label: 'Skipped', value: run.skipped, color: 'text-amber-600' },
          { label: 'Errors', value: run.errored, color: 'text-red-600' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white border border-gray-200 rounded-lg px-4 py-3">
            <div className={`text-2xl font-semibold tabular-nums ${color}`}>{value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Summary (pre-rendered text) */}
      {run.summary && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-gray-700 mb-2">Summary</h2>
          <pre className="bg-white border border-gray-200 rounded-lg px-5 py-4 text-sm text-gray-700 whitespace-pre-wrap font-mono leading-relaxed">
            {run.summary}
          </pre>
        </div>
      )}

      {/* Changes */}
      {changes.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-gray-700 mb-2">
            Changes ({changes.length})
          </h2>
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">Action</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">Name</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">Email</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {changes.map((c, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          c.action === 'created'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}
                      >
                        {c.action}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-900">{c.name}</td>
                    <td className="px-4 py-2.5 text-gray-500">{c.email}</td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs">
                      {c.changes?.map((d, j) => (
                        <span key={j} className="block">
                          {d.property}: <span className="text-red-500 line-through">{d.from ?? '(empty)'}</span>
                          {' '}
                          <span className="text-green-600">{d.to ?? '(empty)'}</span>
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Kept as person (LLM) — scrollable, mirrors the Skipped layout */}
      {kept.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-gray-700 mb-2">
            Kept as person — LLM ({kept.length})
          </h2>
          <div className="bg-white border border-gray-200 rounded-lg">
            <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">
                Sorted by confidence ascending
              </span>
              <span className="text-xs text-gray-400 tabular-nums">{kept.length}</span>
            </div>
            <div className="px-4 py-2 max-h-60 overflow-y-auto">
              {kept.map((k, i) => (
                <div key={i} className="py-1 text-sm flex items-baseline gap-3">
                  <span className="text-gray-700 truncate" style={{ minWidth: '220px' }}>
                    {k.email}
                  </span>
                  <span
                    className={`text-xs tabular-nums ${
                      k.confidence < 0.7 ? 'text-amber-600' : 'text-gray-400'
                    }`}
                    style={{ minWidth: '40px' }}
                  >
                    {k.confidence.toFixed(2)}
                  </span>
                  <span className="text-gray-500 text-xs truncate">{k.reason}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Skipped — grouped by reason */}
      {skipped.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-gray-700 mb-2">
            Skipped ({skipped.length})
          </h2>
          <div className="space-y-4">
            {Object.entries(skipsByReason)
              .sort(([, a], [, b]) => b.length - a.length)
              .map(([reason, entries]) => (
                <div key={reason} className="bg-white border border-gray-200 rounded-lg">
                  <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">
                      {REASON_LABELS[reason] ?? reason}
                    </span>
                    <span className="text-xs text-gray-400 tabular-nums">{entries.length}</span>
                  </div>
                  <div className="px-4 py-2 max-h-60 overflow-y-auto">
                    {entries.map((entry, i) => (
                      <div key={i} className="py-1 text-sm flex items-baseline gap-3">
                        <span className="text-gray-700 truncate" style={{ minWidth: '180px' }}>
                          {entry.name || '(no name)'}
                        </span>
                        <span className="text-gray-400 text-xs truncate" style={{ minWidth: '180px' }}>
                          {entry.email}
                        </span>
                        {entry.source === 'llm' && typeof entry.confidence === 'number' && (
                          <span
                            className={`text-xs tabular-nums ${
                              entry.confidence < 0.7 ? 'text-amber-600' : 'text-gray-400'
                            }`}
                            style={{ minWidth: '40px' }}
                          >
                            {entry.confidence.toFixed(2)}
                          </span>
                        )}
                        {entry.source === 'llm' && entry.detail && (
                          <span className="text-gray-500 text-xs truncate">{entry.detail}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Errors */}
      {errors.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-red-600 mb-2">
            Errors ({errors.length})
          </h2>
          <div className="bg-white border border-red-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-red-50 border-b border-red-200">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-red-700">Name</th>
                  <th className="text-left px-4 py-2.5 font-medium text-red-700">Email</th>
                  <th className="text-left px-4 py-2.5 font-medium text-red-700">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-red-100">
                {errors.map((e, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2.5 text-gray-900">{e.name || '—'}</td>
                    <td className="px-4 py-2.5 text-gray-500">{e.email || '—'}</td>
                    <td className="px-4 py-2.5 text-red-600 text-xs font-mono">{e.error}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
