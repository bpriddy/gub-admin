/**
 * /settings/sync-credentials — bot OAuth authorization Settings page.
 *
 * Three rows, one per bot (directory, drive, groups). Each row shows:
 *   - Status (authorized N ago / never / scope drift detected)
 *   - The Google account that's currently authorized (audit trail)
 *   - Scopes granted vs scopes the code now needs (drift signal)
 *   - Authorize / Re-authorize / Test buttons
 *
 * Server component for the data fetch (reads bot_credentials directly via
 * Prisma — same write surface authority as the rest of gub-admin); a
 * client component holds the buttons + redirect-result banner. The
 * refresh token never leaves the database.
 *
 * See docs/proposals/auth-no-dwd.md for the parent decision and
 * docs/proposals/bot-oauth-design.md for the full design.
 */

import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import {
  isBotOAuthConfigured,
  listBotDisplay,
  scopesForBot,
  type BotName,
} from '@/lib/bot-oauth';
import { SyncCredentialsActions } from './sync-credentials-actions';

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

function relativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${diffDay}d ago`;
}

interface PageSearchParams {
  just_authorized?: string;
  error?: string;
}

export default async function SyncCredentialsPage({
  searchParams,
}: {
  searchParams: PageSearchParams;
}) {
  const configured = isBotOAuthConfigured();
  const display = listBotDisplay();

  const rows = await prisma.botCredential.findMany({
    where: { botName: { in: display.map((d) => d.botName) } },
    include: {
      authorizedByStaff: { select: { id: true, fullName: true, email: true } },
    },
  });
  const rowByBot = new Map(rows.map((r) => [r.botName, r]));

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <Link href="/settings" className="text-sm text-gray-500 hover:text-gray-700">
          ← Settings
        </Link>
      </div>

      <div className="mb-6">
        <h1 className="text-xl font-semibold">Sync Credentials</h1>
        <p className="text-sm text-gray-600 mt-2">
          Authorize the bot Workspace users that GUB uses to sync data on your
          behalf. Each unattended sync runs as a dedicated bot user that you
          consent on its behalf, once. The refresh token is stored server-side
          and never leaves the database.
        </p>
      </div>

      {/* Result banners */}
      {searchParams.just_authorized && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-800">
          Authorized <strong>{searchParams.just_authorized}</strong> successfully.
          You can now run a Test to confirm the credential works.
        </div>
      )}
      {searchParams.error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
          Authorization failed: <code>{searchParams.error}</code>. Try again
          from the Authorize button below. If this persists, check the bot
          OAuth client configuration (see <code>docs/proposals/bot-oauth-design.md</code>).
        </div>
      )}

      {/* Incognito-warning banner — persistent, easy to miss otherwise */}
      <div className="mb-6 px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-900">
        <div className="font-medium mb-1">Use an Incognito window for the consent flow</div>
        <p className="text-amber-800">
          When you click <strong>Authorize</strong>, Google asks you to log in.
          Use an Incognito window or sign out of your personal Google account
          first — otherwise you&apos;ll authorize <em>as yourself</em> instead
          of as the bot user. The page will reload here when the consent flow
          completes.
        </p>
      </div>

      {/* Configuration warning — surfaces when env vars are missing */}
      {!configured && (
        <div className="mb-6 px-4 py-3 rounded-lg bg-gray-50 border border-gray-200 text-sm text-gray-700">
          <div className="font-medium mb-1">Bot OAuth client not configured</div>
          <p>
            <code>GUB_BOT_OAUTH_CLIENT_ID</code> and{' '}
            <code>GUB_BOT_OAUTH_CLIENT_SECRET</code> are not set in this
            environment. Authorize buttons are disabled. See{' '}
            <code>docs/proposals/bot-oauth-design.md</code> for setup.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {display.map((d) => {
          const row = rowByBot.get(d.botName);
          const requiredScopes = scopesForBot(d.botName as BotName);
          const scopeDrift = row
            ? requiredScopes.some((s) => !row.scopes.includes(s))
            : false;

          return (
            <div
              key={d.botName}
              className="bg-white border border-gray-200 rounded-lg p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-medium text-gray-900">
                      {d.label}
                    </h2>
                    {row ? (
                      scopeDrift ? (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                          scope drift — re-authorize
                        </span>
                      ) : (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700">
                          authorized
                        </span>
                      )
                    ) : (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                        not authorized
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{d.description}</p>

                  {row && (
                    <dl className="mt-3 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-xs">
                      <dt className="text-gray-500">Authorized as</dt>
                      <dd className="font-mono text-gray-700">{row.googleEmail}</dd>

                      <dt className="text-gray-500">Authorized at</dt>
                      <dd className="text-gray-700">
                        {formatTime(row.authorizedAt)}{' '}
                        <span className="text-gray-400">
                          ({relativeTime(row.authorizedAt)})
                        </span>
                      </dd>

                      <dt className="text-gray-500">Last used</dt>
                      <dd className="text-gray-700">
                        {row.lastUsedAt ? (
                          <>
                            {formatTime(row.lastUsedAt)}{' '}
                            <span className="text-gray-400">
                              ({relativeTime(row.lastUsedAt)})
                            </span>
                          </>
                        ) : (
                          <span className="text-gray-400">never</span>
                        )}
                      </dd>

                      <dt className="text-gray-500">Authorized by</dt>
                      <dd className="text-gray-700">
                        {row.authorizedByStaff?.fullName ?? (
                          <span className="text-gray-400">unknown</span>
                        )}
                      </dd>

                      <dt className="text-gray-500">Scopes granted</dt>
                      <dd className="text-gray-700 break-all">
                        {row.scopes.length === 0 ? (
                          <span className="text-gray-400">(none)</span>
                        ) : (
                          <ul className="space-y-0.5">
                            {row.scopes.map((s) => (
                              <li key={s} className="font-mono text-[11px]">
                                {s}
                              </li>
                            ))}
                          </ul>
                        )}
                      </dd>

                      {scopeDrift && (
                        <>
                          <dt className="text-amber-700">Scopes needed</dt>
                          <dd className="text-amber-800">
                            <ul className="space-y-0.5">
                              {requiredScopes.map((s) => (
                                <li
                                  key={s}
                                  className={`font-mono text-[11px] ${
                                    row.scopes.includes(s)
                                      ? 'text-gray-500'
                                      : 'text-amber-900 font-medium'
                                  }`}
                                >
                                  {row.scopes.includes(s) ? '' : '+ '}
                                  {s}
                                </li>
                              ))}
                            </ul>
                          </dd>
                        </>
                      )}
                    </dl>
                  )}

                  {!row && (
                    <div className="mt-3 text-xs text-gray-500">
                      Will request:{' '}
                      <span className="font-mono">
                        {requiredScopes.join(', ')}
                      </span>
                    </div>
                  )}
                </div>

                <SyncCredentialsActions
                  botName={d.botName as BotName}
                  authorized={Boolean(row)}
                  configured={configured}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-8 text-xs text-gray-400">
        See{' '}
        <code className="text-gray-500">docs/proposals/auth-no-dwd.md</code>{' '}
        for the architectural decision behind this page, and{' '}
        <code className="text-gray-500">docs/proposals/bot-oauth-design.md</code>{' '}
        for the design.
      </div>
    </div>
  );
}
