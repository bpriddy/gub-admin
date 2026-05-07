'use client';

/**
 * Client-side action buttons for the Sync Credentials page.
 *
 * Three buttons per bot:
 *   - Authorize / Re-authorize  — POSTs to /start-authorize, opens
 *                                 the returned Google consent URL
 *                                 in a new tab (so the admin can use
 *                                 incognito and still see the parent
 *                                 page when they come back)
 *   - Test                       — POSTs to /test, shows result inline
 *
 * No "delete credential" button — re-authorize replaces; deletion is
 * operationally meaningless and just creates breakage. Per design.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { BotName } from '@/lib/bot-oauth';

interface Props {
  botName: BotName;
  authorized: boolean;
  configured: boolean;
}

interface TestResult {
  ok: boolean;
  email?: string;
  message?: string;
  code?: string;
}

export function SyncCredentialsActions({ botName, authorized, configured }: Props) {
  const router = useRouter();
  const [authorizing, setAuthorizing] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  async function handleAuthorize(): Promise<void> {
    setAuthorizing(true);
    setTestResult(null);
    try {
      const res = await fetch(
        `/api/sync-credentials/${botName}/start-authorize`,
        { method: 'POST' },
      );
      const body = (await res.json()) as { authorizeUrl?: string; error?: string; message?: string };
      if (!res.ok || !body.authorizeUrl) {
        alert(
          `Could not start authorize: ${body.message ?? body.error ?? res.statusText}`,
        );
        return;
      }
      // Open in a new tab. Admin can use incognito or a dedicated profile
      // for the bot login; the parent tab stays here so the redirect-back
      // result banner is visible when they finish.
      window.open(body.authorizeUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      alert(`Authorize request failed: ${String(err)}`);
    } finally {
      setAuthorizing(false);
    }
  }

  async function handleTest(): Promise<void> {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`/api/sync-credentials/${botName}/test`, {
        method: 'POST',
      });
      const body = (await res.json()) as {
        ok: boolean;
        googleEmail?: string;
        code?: string;
        message?: string;
      };
      setTestResult({
        ok: body.ok,
        email: body.googleEmail,
        code: body.code,
        message: body.message,
      });
      // Refresh server-side data so any field shifts (e.g. the actual email
      // didn't match what was stored) re-render. last_used_at is NOT
      // bumped by /test, so this is just a defensive refresh.
      router.refresh();
    } catch (err) {
      setTestResult({ ok: false, message: String(err) });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 items-stretch w-44">
      <button
        type="button"
        onClick={handleAuthorize}
        disabled={!configured || authorizing}
        className="text-xs px-3 py-1.5 rounded border border-gray-900 bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
      >
        {authorizing
          ? 'Opening…'
          : authorized
            ? 'Re-authorize'
            : 'Authorize'}
      </button>

      <button
        type="button"
        onClick={handleTest}
        disabled={!authorized || testing}
        className="text-xs px-3 py-1.5 rounded border border-gray-300 bg-white text-gray-700 hover:border-gray-500 disabled:opacity-40 disabled:cursor-not-allowed transition"
      >
        {testing ? 'Testing…' : 'Test'}
      </button>

      {testResult && (
        <div
          className={
            'text-xs rounded px-2 py-1.5 ' +
            (testResult.ok
              ? 'bg-green-50 border border-green-200 text-green-800'
              : 'bg-red-50 border border-red-200 text-red-800')
          }
        >
          {testResult.ok ? (
            <>
              ✓ Works as <span className="font-mono break-all">{testResult.email}</span>
            </>
          ) : (
            <>
              ✗ {testResult.code ?? 'FAILED'}
              {testResult.message && (
                <div className="text-[11px] mt-1 break-words">
                  {testResult.message}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
