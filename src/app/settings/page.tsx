import Link from 'next/link';

export const dynamic = 'force-dynamic';

const SETTINGS = [
  {
    href: '/settings/cors-origins',
    title: 'CORS allow-list',
    description:
      'Origins permitted to make cross-origin requests to GUB. Add an origin when a dev hits the 403; change is live on the next request, no redeploy.',
  },
] as const;

export default function SettingsIndexPage() {
  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">
          Operator-facing platform settings. More entries land here as new
          settings surfaces are added.
        </p>
      </div>

      <ul className="space-y-3">
        {SETTINGS.map((s) => (
          <li key={s.href}>
            <Link
              href={s.href}
              className="block bg-white border border-gray-200 rounded-lg px-5 py-4 hover:border-gray-300 hover:shadow-sm transition"
            >
              <div className="text-sm font-medium text-gray-900">{s.title}</div>
              <div className="text-xs text-gray-500 mt-1">{s.description}</div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
