/**
 * StatusMarkdownPanel — renders an entity's `status_markdown` and (when
 * present) `status_sensitive_markdown` as readable cards on the account /
 * campaign detail pages.
 *
 * Two blobs, two cards. The general blob always renders (entity always has
 * read access at this surface). The sensitive blob is gated by an access
 * grant — for now gub-admin shows it unconditionally (IAP-3-admins space),
 * but the `viewerHasSensitive` prop is here so we can wire enforcement when
 * non-admin consumers appear.
 *
 * Doc shapes (per D2/D29 in docs/status-markdown-plan.md):
 *
 *   General (status_markdown):
 *     _edited_at: YYYY-MM-DD_
 *     ## At a glance
 *     - Label: value
 *     ## Context
 *     - bullet
 *
 *   Sensitive (status_sensitive_markdown):
 *     _edited_at: YYYY-MM-DD_
 *     ## Context
 *     - sensitive bullet
 *
 * No markdown lib needed — the shape is already plain-text legible.
 */

interface StatusMarkdownPanelProps {
  markdown: string | null | undefined;
  sensitiveMarkdown?: string | null | undefined;
  /**
   * Whether the viewer can see the sensitive blob. Defaults to true for
   * gub-admin (the only consumer right now, IAP-3-admins). When non-admin
   * surfaces consume this component, pass an explicit grant check.
   */
  viewerHasSensitive?: boolean;
}

function extractEditedAt(markdown: string): { editedAt: string | null; body: string } {
  const lines = markdown.split('\n');
  const m = lines[0]?.match(/^_edited_at:\s*(\d{4}-\d{2}-\d{2})_\s*$/);
  if (m && m[1]) {
    let bodyStart = 1;
    if (lines[1] === '') bodyStart = 2;
    return { editedAt: m[1], body: lines.slice(bodyStart).join('\n') };
  }
  return { editedAt: null, body: markdown };
}

function StatusCard({
  label,
  markdown,
  emptyHint,
  borderClass = 'border-gray-200',
  badgeClass,
  badgeText,
}: {
  label: string;
  markdown: string | null | undefined;
  emptyHint: string;
  borderClass?: string;
  badgeClass?: string;
  badgeText?: string;
}) {
  if (!markdown) {
    return (
      <div className={`mt-6 p-4 bg-white border ${borderClass} rounded-lg`}>
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <div className="text-xs font-medium text-gray-500 uppercase">{label}</div>
            {badgeText && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${badgeClass ?? 'bg-gray-100 text-gray-600'}`}>
                {badgeText}
              </span>
            )}
          </div>
        </div>
        <p className="text-sm text-gray-400 italic">{emptyHint}</p>
      </div>
    );
  }

  const { editedAt, body } = extractEditedAt(markdown);

  return (
    <div className={`mt-6 p-4 bg-white border ${borderClass} rounded-lg`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="text-xs font-medium text-gray-500 uppercase">{label}</div>
          {badgeText && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${badgeClass ?? 'bg-gray-100 text-gray-600'}`}>
              {badgeText}
            </span>
          )}
        </div>
        {editedAt && <div className="text-xs text-gray-500">Last synthesized: {editedAt}</div>}
      </div>
      <pre className="text-xs whitespace-pre-wrap break-words font-mono leading-relaxed text-gray-800 bg-gray-50 border border-gray-100 rounded p-3 overflow-x-auto">
        {body}
      </pre>
    </div>
  );
}

export default function StatusMarkdownPanel({
  markdown,
  sensitiveMarkdown,
  viewerHasSensitive = true,
}: StatusMarkdownPanelProps) {
  return (
    <>
      <StatusCard
        label="Status snapshot"
        markdown={markdown}
        emptyHint="No status_markdown yet. Will be populated by the Drive sync (backfill or forward sync)."
      />
      {viewerHasSensitive && (
        <StatusCard
          label="Sensitive context"
          markdown={sensitiveMarkdown}
          emptyHint="No sensitive context recorded. Backfill auto-classifies; forward-sync reviewers can mark items sensitive on approval."
          borderClass="border-amber-200"
          badgeClass="bg-amber-100 text-amber-800 border border-amber-200"
          badgeText="restricted"
        />
      )}
    </>
  );
}
