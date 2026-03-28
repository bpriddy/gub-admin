import Link from 'next/link';

const sections = [
  { href: '/users', label: 'Users', description: 'Google OAuth identities — auth credentials' },
  { href: '/staff', label: 'Staff', description: 'Org identity — current and former employees' },
  { href: '/accounts', label: 'Accounts', description: 'Client accounts and brand relationships' },
  { href: '/campaigns', label: 'Campaigns', description: 'Engagements within accounts' },
  { href: '/grants', label: 'Access Grants', description: 'Per-user, per-resource access control' },
];

export default function Home() {
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-1">GUB Admin</h1>
      <p className="text-sm text-gray-500 mb-8">GCP Universal Backend — internal CMS</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {sections.map(({ href, label, description }) => (
          <Link
            key={href}
            href={href}
            className="block p-5 bg-white border border-gray-200 rounded-lg hover:border-gray-400 transition-colors"
          >
            <div className="font-medium text-sm mb-1">{label}</div>
            <div className="text-xs text-gray-500">{description}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
