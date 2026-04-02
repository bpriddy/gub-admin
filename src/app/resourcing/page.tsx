'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface MetadataEntry {
  id: string;
  type: string;
  label: string;
  value: string | null;
  notes: string | null;
  isFeatured: boolean;
}

interface ResourcingResult {
  staffId:  string;
  fullName: string;
  email:    string;
  title:    string | null;
  status:   string;
  entries:  MetadataEntry[];
}

const SEED_TYPES = ['skill', 'interest', 'work_highlight', 'certification', 'tool', 'language'];

export default function ResourcingPage() {
  const [type, setType]         = useState('skill');
  const [label, setLabel]       = useState('');
  const [value, setValue]       = useState('');
  const [featuredOnly, setFeaturedOnly] = useState(false);
  const [results, setResults]   = useState<ResourcingResult[] | null>(null);
  const [loading, setLoading]   = useState(false);
  const [allTypes, setAllTypes] = useState<string[]>(SEED_TYPES);
  const [labelsByType, setLabelsByType] = useState<Record<string, string[]>>({});

  useEffect(() => {
    fetch('/api/staff-metadata/options')
      .then((r) => r.json())
      .then((d: { types: string[]; labelsByType: Record<string, string[]> }) => {
        setAllTypes(Array.from(new Set([...SEED_TYPES, ...d.types])));
        setLabelsByType(d.labelsByType);
      });
  }, []);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const qs = new URLSearchParams({ type });
    if (label.trim()) qs.set('label', label.trim());
    if (value.trim()) qs.set('value', value.trim());
    if (featuredOnly) qs.set('featured', 'true');
    const res = await fetch(`/api/resourcing?${qs}`);
    setResults(await res.json());
    setLoading(false);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Resourcing search</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Find staff by skills, interests, certifications, or any other metadata type.
        </p>
      </div>

      {/* Search form */}
      <form onSubmit={search} className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Type <span className="text-red-400">*</span></label>
            <input
              list="type-list"
              required
              value={type}
              onChange={(e) => { setType(e.target.value); setLabel(''); }}
              placeholder="skill"
              className="w-full text-sm border border-gray-300 rounded px-2 py-1.5"
            />
            <datalist id="type-list">
              {allTypes.map((t) => <option key={t} value={t} />)}
            </datalist>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Label <span className="text-gray-300">(partial match)</span>
            </label>
            <input
              list="label-list"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. video"
              className="w-full text-sm border border-gray-300 rounded px-2 py-1.5"
            />
            <datalist id="label-list">
              {(labelsByType[type] ?? []).map((l) => <option key={l} value={l} />)}
            </datalist>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Value <span className="text-gray-300">(exact)</span>
            </label>
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="e.g. expert"
              className="w-full text-sm border border-gray-300 rounded px-2 py-1.5"
            />
          </div>
        </div>
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={featuredOnly}
              onChange={(e) => setFeaturedOnly(e.target.checked)}
            />
            Featured entries only
          </label>
          <button
            type="submit"
            disabled={loading}
            className="text-sm bg-gray-900 text-white px-4 py-1.5 rounded disabled:opacity-50 hover:bg-gray-700"
          >
            {loading ? 'Searching…' : 'Search'}
          </button>
        </div>
      </form>

      {/* Results */}
      {results !== null && (
        <div className="space-y-3">
          <p className="text-xs text-gray-400">
            {results.length === 0
              ? 'No staff found matching these criteria.'
              : `${results.length} staff member${results.length !== 1 ? 's' : ''} found`}
          </p>

          {results.map((person) => (
            <div key={person.staffId} className="bg-white border border-gray-200 rounded-lg p-4 space-y-2">
              <div className="flex items-start justify-between">
                <div>
                  <Link
                    href={`/staff/${person.staffId}`}
                    className="text-sm font-medium text-blue-600 hover:underline"
                  >
                    {person.fullName}
                  </Link>
                  <p className="text-xs text-gray-500">{person.title ?? '—'} · {person.email}</p>
                </div>
                <span className={`text-xs px-1.5 py-0.5 rounded ${
                  person.status === 'active'
                    ? 'bg-green-50 text-green-700'
                    : 'bg-gray-100 text-gray-500'
                }`}>
                  {person.status}
                </span>
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                {person.entries.map((e) => (
                  <div
                    key={e.id}
                    className={`flex items-center gap-1.5 border rounded px-2 py-1 text-xs ${
                      e.isFeatured
                        ? 'border-yellow-200 bg-yellow-50'
                        : 'border-gray-100 bg-gray-50'
                    }`}
                  >
                    <span className="font-medium text-gray-700">{e.label}</span>
                    {e.value && (
                      <span className="font-mono text-gray-400">{e.value}</span>
                    )}
                    {e.isFeatured && <span className="text-yellow-500">★</span>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
