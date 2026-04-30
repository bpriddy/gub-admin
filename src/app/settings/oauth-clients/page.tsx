/**
 * /settings/oauth-clients — manage registered OAuth Agent Clients.
 *
 * These are the clients that consume the GUB OAuth broker (headless,
 * server-side flow). Use this surface to register a new client (issues
 * a one-time client_secret), edit name / redirect URIs, deactivate
 * (soft, recoverable), or delete (hard, audited but cascades).
 *
 * "Agent" framing: every entry here is a server-side / agent-style
 * client. End-user OAuth happens via the broker too but those clients
 * are not registered through this list — only the agents that hold a
 * client_secret are.
 */
import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { AddClientForm } from './add-client-form';
import { ClientActions } from './client-actions';

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

export default async function OAuthClientsSettingsPage() {
  const clients = await prisma.oAuthClient.findMany({
    select: {
      id: true,
      clientId: true,
      name: true,
      redirectUris: true,
      isActive: true,
      createdAt: true,
      _count: { select: { authCodes: true, pendingAuths: true } },
    },
    orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
  });

  const activeCount = clients.filter((c) => c.isActive).length;
  const inactiveCount = clients.length - activeCount;
  const discoveryUrl =
    (process.env['NEXT_PUBLIC_GUB_URL'] ?? 'http://localhost:3000') +
    '/.well-known/oauth-authorization-server';

  return (
    <div className="max-w-5xl">
      <div className="mb-6">
        <Link href="/settings" className="text-sm text-gray-500 hover:text-gray-700">
          &larr; Settings
        </Link>
      </div>

      <div className="mb-2">
        <h1 className="text-xl font-semibold">OAuth Agent Clients</h1>
      </div>
      <p className="text-sm text-gray-500 mb-6 max-w-2xl">
        Server-side / agent clients registered with the GUB OAuth broker.
        Each entry holds a name, one or more redirect URIs, and a hashed
        client secret. The plaintext secret is shown once at creation —
        copy it then; rotate by deleting and re-registering.
      </p>

      <div className="mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-2">Register client</h2>
        <AddClientForm />
      </div>

      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-gray-700">
          Clients ({activeCount} active{inactiveCount > 0 ? `, ${inactiveCount} inactive` : ''})
        </h2>
      </div>
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Client ID</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Redirect URIs</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Created</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {clients.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  No clients registered yet. Register one above to get started.
                </td>
              </tr>
            )}
            {clients.map((c) => (
              <tr key={c.id} className={c.isActive ? '' : 'bg-gray-50/50'}>
                <td className="px-4 py-3 font-medium text-gray-900 align-top">{c.name}</td>
                <td className="px-4 py-3 font-mono text-xs text-gray-600 align-top break-all">
                  {c.clientId}
                </td>
                <td className="px-4 py-3 align-top">
                  <ul className="space-y-0.5">
                    {c.redirectUris.map((uri) => (
                      <li key={uri} className="text-xs font-mono text-gray-500 break-all">
                        {uri}
                      </li>
                    ))}
                  </ul>
                </td>
                <td className="px-4 py-3 align-top">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      c.isActive
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {c.isActive ? 'active' : 'inactive'}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs align-top">
                  {formatTime(c.createdAt)}
                </td>
                <td className="px-4 py-3 align-top">
                  <ClientActions
                    clientId={c.clientId}
                    name={c.name}
                    redirectUris={c.redirectUris}
                    isActive={c.isActive}
                    authCodeCount={c._count.authCodes}
                    pendingAuthCount={c._count.pendingAuths}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-gray-400 border-t mt-6 pt-4">
        <p>
          Discovery document:{' '}
          <code className="font-mono bg-gray-100 px-1 rounded break-all">{discoveryUrl}</code>
        </p>
      </div>
    </div>
  );
}
