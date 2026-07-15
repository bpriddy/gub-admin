'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

// Form state keeps temperature as TEXT: coercing on every keystroke turns a
// cleared <input type="number"> into 0 (Number('') === 0) and React rewrites
// the field to "0", making "cleared" indistinguishable from an intentional
// zero — which the API would happily persist. Parse + validate on save.
interface FormFields {
  description: string;
  model: string;
  temperatureText: string;
  isActive: boolean;
  template: string;
}

interface StoredPreset {
  description: string | null;
  model: string;
  temperature: number;
  isActive: boolean;
  template: string;
  updatedAt: string;
}

// Same placeholder syntax runPreset renders ({{var_name}}). Shown live so an
// operator editing the template sees exactly which variables it references —
// a variable the caller doesn't supply renders as an empty string at run time.
const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

function detectVariables(template: string): string[] {
  const names = new Set<string>();
  const re = new RegExp(PLACEHOLDER.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(template)) !== null) names.add(m[1]!);
  return Array.from(names);
}

function toForm(stored: StoredPreset): FormFields {
  return {
    description: stored.description ?? '',
    model: stored.model,
    temperatureText: String(stored.temperature),
    isActive: stored.isActive,
    template: stored.template,
  };
}

export default function PresetEditor({ presetKey, initial }: { presetKey: string; initial: StoredPreset }) {
  const router = useRouter();
  const [fields, setFields] = useState<FormFields>(() => toForm(initial));
  const [saved, setSaved] = useState<FormFields>(() => toForm(initial));
  // Optimistic-concurrency token: the updatedAt of the version this editor
  // last loaded/saved. The PATCH rejects with 409 when the row has moved on,
  // so one admin's save can't silently revert another's.
  const [expectedUpdatedAt, setExpectedUpdatedAt] = useState(initial.updatedAt);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; message: string } | null>(null);

  const variables = useMemo(() => detectVariables(fields.template), [fields.template]);
  const dirty =
    fields.description !== saved.description ||
    fields.model !== saved.model ||
    fields.temperatureText !== saved.temperatureText ||
    fields.isActive !== saved.isActive ||
    fields.template !== saved.template;

  async function save() {
    const temperature = Number(fields.temperatureText);
    if (fields.temperatureText.trim() === '' || !Number.isFinite(temperature) || temperature < 0 || temperature > 2) {
      setStatus({ kind: 'error', message: 'Temperature must be a number between 0 and 2.' });
      return;
    }
    setSaving(true);
    setStatus(null);
    // Send only what changed — the PATCH route requires at least one field.
    const body: Record<string, unknown> = { expectedUpdatedAt };
    if (fields.description !== saved.description) body.description = fields.description;
    if (fields.model !== saved.model) body.model = fields.model;
    if (fields.temperatureText !== saved.temperatureText) body.temperature = temperature;
    if (fields.isActive !== saved.isActive) body.isActive = fields.isActive;
    if (fields.template !== saved.template) body.template = fields.template;
    try {
      const res = await fetch(`/api/prompt-presets/${encodeURIComponent(presetKey)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.status === 409) {
        setStatus({
          kind: 'error',
          message: 'This preset was changed by someone else since you loaded it. Reload the page to pick up their version before editing.',
        });
        return;
      }
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: unknown } | null;
        throw new Error(typeof err?.error === 'string' ? err.error : `Save failed (${res.status})`);
      }
      // Sync the form to what the server actually STORED (trimmed template,
      // Decimal(3,2)-rounded temperature) — not to what we sent.
      const stored = (await res.json()) as StoredPreset;
      const form = toForm(stored);
      setFields(form);
      setSaved(form);
      setExpectedUpdatedAt(stored.updatedAt);
      setStatus({ kind: 'ok', message: 'Saved — live on the next LLM call.' });
      router.refresh();
    } catch (err) {
      setStatus({ kind: 'error', message: err instanceof Error ? err.message : 'Save failed' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">Description</label>
          <input
            type="text"
            value={fields.description}
            onChange={(e) => setFields({ ...fields, description: e.target.value })}
            className="w-full border border-gray-200 rounded px-3 py-2 text-sm"
            placeholder="What this preset is for"
          />
        </div>
        <div className="flex gap-4 items-end flex-wrap">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Model</label>
            <input
              type="text"
              value={fields.model}
              onChange={(e) => setFields({ ...fields, model: e.target.value })}
              className="border border-gray-200 rounded px-3 py-2 text-sm font-mono w-56"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Temperature</label>
            <input
              type="text"
              inputMode="decimal"
              value={fields.temperatureText}
              onChange={(e) => setFields({ ...fields, temperatureText: e.target.value })}
              className="border border-gray-200 rounded px-3 py-2 text-sm w-24"
              placeholder="0.0–2.0"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600 pb-2 cursor-pointer">
            <input
              type="checkbox"
              checked={fields.isActive}
              onChange={(e) => setFields({ ...fields, isActive: e.target.checked })}
            />
            Active
          </label>
          {!fields.isActive && (
            <span className="text-xs text-red-600 pb-2">
              Inactive presets make consuming calls FAIL — this is a kill switch, not a soft hide.
            </span>
          )}
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-gray-600">Template</label>
          <span className="text-xs text-gray-400">{fields.template.length.toLocaleString()} chars</span>
        </div>
        <textarea
          value={fields.template}
          onChange={(e) => setFields({ ...fields, template: e.target.value })}
          rows={30}
          spellCheck={false}
          className="w-full border border-gray-200 rounded px-3 py-2 text-xs font-mono leading-relaxed"
        />
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-400">Variables:</span>
          {variables.length > 0 ? (
            variables.map((v) => (
              <span key={v} className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-mono">
                {'{{'}
                {v}
                {'}}'}
              </span>
            ))
          ) : (
            <span className="text-xs text-gray-400">none</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={!dirty || saving}
          className="px-4 py-2 text-sm rounded bg-blue-600 text-white disabled:bg-gray-300 disabled:cursor-not-allowed hover:bg-blue-700 transition-colors"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        {dirty && !saving && <span className="text-xs text-gray-400">Unsaved changes</span>}
        {status && (
          <span className={`text-sm ${status.kind === 'ok' ? 'text-green-600' : 'text-red-600'}`}>
            {status.message}
          </span>
        )}
      </div>
    </div>
  );
}
