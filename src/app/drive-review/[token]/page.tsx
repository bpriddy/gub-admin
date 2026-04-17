import { ReviewClient } from './review-client';
import type { ReviewSession } from './types';

export const dynamic = 'force-dynamic';

const GUB_URL =
  process.env['GUB_BACKEND_URL'] ??
  process.env['NEXT_PUBLIC_GUB_URL'] ??
  'http://localhost:3000';

/**
 * Drive Review — magic-link landing page.
 *
 * This route is IAP-exempt (see middleware.ts). The URL token is the sole
 * credential; reviewers arrive here from an email link and may not be
 * signed into their Workspace account on this device.
 *
 * Server-side: we fetch the session directly from the GUB backend using
 * the server-side env var. The backend handles 404 (unknown token), 410
 * (expired), and 403 (inactive reviewer) cases with specific error
 * messages. We render those inline rather than throwing.
 *
 * Client-side: the ReviewClient component owns form state + submission.
 */
export default async function DriveReviewPage({
  params,
}: {
  params: { token: string };
}) {
  const { token } = params;

  // Server-side fetch — bypass the /api proxy since we already have the
  // backend URL server-side. Saves a hop and gives us raw status codes.
  const res = await fetch(
    `${GUB_URL}/integrations/google-drive/review/${encodeURIComponent(token)}`,
    { method: 'GET', cache: 'no-store' },
  ).catch(() => null);

  if (!res) {
    return (
      <ErrorShell
        title="Can't reach GUB right now"
        message="The review service is unavailable. Try again in a minute, or contact an admin if this keeps happening."
      />
    );
  }

  if (!res.ok) {
    let detail = 'This review link is invalid.';
    try {
      const body = (await res.json()) as { error?: string };
      if (typeof body.error === 'string') detail = body.error;
    } catch {
      /* fall through with default */
    }

    if (res.status === 404) {
      return <ErrorShell title="Review link not found" message={detail} />;
    }
    if (res.status === 410) {
      return <ErrorShell title="Review link expired" message={detail} />;
    }
    if (res.status === 403) {
      return <ErrorShell title="Reviewer is inactive" message={detail} />;
    }
    return <ErrorShell title="Can't load review" message={detail} />;
  }

  const session = (await res.json()) as ReviewSession;

  const totalPending = session.fieldChanges.length + session.newEntityGroups.length;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold text-gray-900">Drive Review</h1>
          <p className="text-sm text-gray-500 mt-1">
            {session.reviewer.fullName} &middot; {session.reviewer.email}
          </p>
          {totalPending === 0 ? (
            <p className="text-sm text-gray-600 mt-3">
              You&apos;re all caught up — no pending proposals.
            </p>
          ) : (
            <p className="text-sm text-gray-600 mt-3">
              {session.newEntityGroups.length > 0 && (
                <>
                  <span className="font-medium">{session.newEntityGroups.length}</span>{' '}
                  new {session.newEntityGroups.length === 1 ? 'entity' : 'entities'}
                  {session.fieldChanges.length > 0 && ' · '}
                </>
              )}
              {session.fieldChanges.length > 0 && (
                <>
                  <span className="font-medium">{session.fieldChanges.length}</span>{' '}
                  proposed{' '}
                  {session.fieldChanges.length === 1 ? 'change' : 'changes'}
                </>
              )}
            </p>
          )}
        </header>

        {totalPending > 0 && <ReviewClient token={token} session={session} />}
      </div>
    </div>
  );
}

function ErrorShell({ title, message }: { title: string; message: string }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white border border-gray-200 rounded-lg p-8 max-w-md w-full text-center">
        <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
        <p className="text-sm text-gray-500 mt-2">{message}</p>
      </div>
    </div>
  );
}
