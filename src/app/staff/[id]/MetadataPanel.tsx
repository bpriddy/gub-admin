'use client';

import { useEffect, useState } from 'react';

interface MetadataRow {
  id: string;
  staffId: string;
  type: string;
  label: string;
  value: string | null;
  notes: string | null;
  isFeatured: boolean;
  createdAt: string;
  updatedAt: string;
}

// Fallback seeds shown before the first DB entry is added for each type.
// Once real entries exist they supersede these automatically.
const SEED_TYPES = ['skill', 'interest', 'work_highlight', 'certification', 'tool', 'language'];
const VALUE_SUGGESTIONS: Record<string, string[]> = {
  skill:    ['beginner', 'intermediate', 'expert'],
  interest: ['low', 'high'],
};

const EMPTY_FORM = { type: '', label: '', value: '', notes: '', isFeatured: false };

interface Options {
  types: string[];
  labelsByType: Record<string, string[]>;
}

export default function MetadataPanel({ staffId }: { staffId: string }) {
  const [rows, setRows]       = useState<MetadataRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [options, setOptions] = useState<Options>({ types: SEED_TYPES, labelsByType: {} });
  const [typeFilter, setTypeFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]       = useState(EMPTY_FORM);
  const [saving, setSaving]   = useState(false);
  const [editId, setEditId]   = useState<string | null>(null);
  const [editState, setEditState] = useState<Partial<MetadataRow>>({});
  const [error, setError]     = useState<string | null>(null);

  async function loadOptions() {
    const res = await fetch('/api/staff-metadata/options');
    const data = await res.json() as Options;
    // Merge DB types with seed types so seeds still show before first entry
    setOptions({
      types: Array.from(new Set([...SEED_TYPES, ...data.types])),
      labelsByType: data.labelsByType,
    });
  }

  async function load() {
    setLoading(true);
    const qs = typeFilter ? `?type=${encodeURIComponent(typeFilter)}` : '';
    const res = await fetch(`/api/staff/${staffId}/metadata${qs}`);
    setRows(await res.json());
    setLoading(false);
  }

  useEffect(() => { void loadOptions(); }, []);
  useEffect(() => { void load(); }, [typeFilter]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const res = await fetch(`/api/staff/${staffId}/metadata`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type:       form.type,
        label:      form.label,
        value:      form.value.trim()  || null,
        notes:      form.notes.trim()  || null,
        isFeatured: form.isFeatured,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const d = await res.json();
      setError(typeof d.error === 'string' ? d.error : 'Failed to save');
      return;
    }
    setForm(EMPTY_FORM);
    setShowForm(false);
    void load();
    void loadOptions(); // refresh so new type/label appears in future suggestions
  }

  async function saveEdit(id: string) {
    setSaving(true);
    await fetch(`/api/staff/${staffId}/metadata/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(editState.type       !== undefined ? { type: editState.type }       : {}),
        ...(editState.label      !== undefined ? { label: editState.label }     : {}),
        value:      editState.value      ?? null,
        notes:      editState.notes      ?? null,
        isFeatured: editState.isFeatured ?? false,
      }),
    });
    setSaving(false);
    setEditId(null);
    void load();
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this entry?')) return;
    await fetch(`/api/staff/${staffId}/metadata/${id}`, { method: 'DELETE' });
    void load();
  }

  // Group rows by type for display
  const grouped = rows.reduce<Record<string, MetadataRow[]>>((acc, r) => {
    (acc[r.type] ??= []).push(r);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="text-sm border border-gray-300 rounded px-2 py-1"
        >
          <option value="">All types</option>
          {options.types.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <button
          onClick={() => { setShowForm(true); setError(null); }}
          className="text-sm bg-gray-900 text-white px-3 py-1.5 rounded hover:bg-gray-700"
        >
          + Add entry
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <form onSubmit={handleCreate} className="border border-gray-200 rounded-lg p-4 bg-white space-y-3">
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Type</label>
              <input
                list="type-suggestions"
                required
                value={form.type}
                onChange={(e) => setForm((s) => ({ ...s, type: e.target.value }))}
                placeholder="skill"
                className="w-full text-sm border border-gray-300 rounded px-2 py-1"
              />
              <datalist id="type-suggestions">
                {options.types.map((t) => <option key={t} value={t} />)}
              </datalist>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Label</label>
              <input
                list="label-suggestions"
                required
                value={form.label}
                onChange={(e) => setForm((s) => ({ ...s, label: e.target.value }))}
                placeholder="Video Editing"
                className="w-full text-sm border border-gray-300 rounded px-2 py-1"
              />
              <datalist id="label-suggestions">
                {(options.labelsByType[form.type] ?? []).map((l) => <option key={l} value={l} />)}
              </datalist>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                Value <span className="text-gray-300">(optional)</span>
              </label>
              <input
                list="value-suggestions"
                value={form.value}
                onChange={(e) => setForm((s) => ({ ...s, value: e.target.value }))}
                placeholder={form.type === 'interest' ? 'high' : 'expert'}
                className="w-full text-sm border border-gray-300 rounded px-2 py-1"
              />
              <datalist id="value-suggestions">
                {(VALUE_SUGGESTIONS[form.type] ?? []).map((v) => <option key={v} value={v} />)}
              </datalist>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                Notes <span className="text-gray-300">(optional)</span>
              </label>
              <input
                value={form.notes}
                onChange={(e) => setForm((s) => ({ ...s, notes: e.target.value }))}
                className="w-full text-sm border border-gray-300 rounded px-2 py-1"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={form.isFeatured}
              onChange={(e) => setForm((s) => ({ ...s, isFeatured: e.target.checked }))}
            />
            <span>Featured <span className="text-gray-400 text-xs">— surface prominently in resourcing search</span></span>
          </label>
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={saving} className="text-sm bg-gray-900 text-white px-3 py-1.5 rounded disabled:opacity-50">
              {saving ? 'Saving…' : 'Add'}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="text-sm text-gray-500 px-3 py-1.5">Cancel</button>
          </div>
        </form>
      )}

      {/* Grouped rows */}
      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-400">No entries yet.</p>
      ) : (
        Object.entries(grouped).map(([type, entries]) => (
          <div key={type}>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{type}</h3>
            <div className="space-y-1">
              {entries.map((row) => (
                <div key={row.id} className="border border-gray-100 rounded bg-white px-3 py-2">
                  {editId === row.id ? (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          value={editState.label ?? ''}
                          onChange={(e) => setEditState((s) => ({ ...s, label: e.target.value }))}
                          className="text-sm border border-gray-300 rounded px-2 py-1"
                          placeholder="Label"
                        />
                        <input
                          value={editState.value ?? ''}
                          onChange={(e) => setEditState((s) => ({ ...s, value: e.target.value }))}
                          className="text-sm border border-gray-300 rounded px-2 py-1"
                          placeholder="Value"
                        />
                      </div>
                      <input
                        value={editState.notes ?? ''}
                        onChange={(e) => setEditState((s) => ({ ...s, notes: e.target.value }))}
                        className="w-full text-sm border border-gray-300 rounded px-2 py-1"
                        placeholder="Notes"
                      />
                      <label className="flex items-center gap-2 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editState.isFeatured ?? false}
                          onChange={(e) => setEditState((s) => ({ ...s, isFeatured: e.target.checked }))}
                        />
                        Featured
                      </label>
                      <div className="flex gap-2">
                        <button onClick={() => saveEdit(row.id)} disabled={saving} className="text-xs bg-gray-900 text-white px-2 py-1 rounded disabled:opacity-50">Save</button>
                        <button onClick={() => setEditId(null)} className="text-xs text-gray-500 px-2 py-1">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        <span className="text-sm font-medium text-gray-800">{row.label}</span>
                        {row.value && (
                          <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-mono">{row.value}</span>
                        )}
                        {row.isFeatured && (
                          <span className="text-xs bg-yellow-50 text-yellow-600 px-1.5 py-0.5 rounded">featured</span>
                        )}
                        {row.notes && (
                          <span className="text-xs text-gray-400 truncate">{row.notes}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => { setEditId(row.id); setEditState({ label: row.label, value: row.value ?? '', notes: row.notes ?? '', isFeatured: row.isFeatured }); }}
                          className="text-xs text-gray-400 hover:text-gray-700"
                        >
                          Edit
                        </button>
                        <button onClick={() => handleDelete(row.id)} className="text-xs text-red-400 hover:text-red-600">Delete</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
