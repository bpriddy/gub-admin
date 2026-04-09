import type { Metadata } from 'next';
import localFont from 'next/font/local';
import Link from 'next/link';
import './globals.css';

const geistSans = localFont({
  src: './fonts/GeistVF.woff',
  variable: '--font-geist-sans',
  weight: '100 900',
});
const geistMono = localFont({
  src: './fonts/GeistMonoVF.woff',
  variable: '--font-geist-mono',
  weight: '100 900',
});

export const metadata: Metadata = {
  title: 'GUB Admin',
  description: 'GCP Universal Backend — Admin CMS',
};

const navLinks = [
  { href: '/users', label: 'Users' },
  { href: '/staff', label: 'Staff' },
  { href: '/offices', label: 'Offices' },
  { href: '/teams', label: 'Teams' },
  { href: '/accounts', label: 'Accounts' },
  { href: '/campaigns', label: 'Campaigns' },
  { href: '/grants', label: 'Access Grants' },
  { href: '/access-requests', label: 'Access Requests' },
  { href: '/apps', label: 'Apps' },
  { href: '/app-access-requests', label: 'App Requests' },
  { href: '/resourcing', label: 'Resourcing' },
  { href: '/data-sources', label: 'Data Sources' },
  { href: '/oauth-clients', label: 'OAuth Clients' },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-gray-50 text-gray-900`}>
        <div className="min-h-screen flex flex-col">
          <nav className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-6">
            <span className="font-semibold text-sm tracking-tight text-gray-800">GUB Admin</span>
            <div className="flex gap-4">
              {navLinks.map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
                >
                  {label}
                </Link>
              ))}
            </div>
          </nav>
          <main className="flex-1 px-6 py-8 max-w-6xl mx-auto w-full">{children}</main>
        </div>
      </body>
    </html>
  );
}
