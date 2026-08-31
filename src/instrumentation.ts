/**
 * instrumentation.ts — Next.js server instrumentation (loaded once per
 * server start; requires experimental.instrumentationHook in next.config).
 *
 * On Cloud Run, server-side console.error/console.warn calls are rewrapped
 * to emit ONE single-line JSON object per call, carrying a real Cloud
 * Logging severity. Without this, Next's error dumps (multi-line stacks)
 * are split by Cloud Run into dozens of unlinked textPayload lines with
 * severity Default — invisible to "only errors" filters and log-based
 * alerts. Proven cost: the offices-page Prisma error (okta_city) sat in
 * the logs that way from July 30 until it was found by hand a month later.
 *
 * Local dev is untouched (the wrap activates only when Cloud Run's
 * K_SERVICE/CLOUD_RUN_JOB env is present).
 */

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (!process.env.K_SERVICE && !process.env.CLOUD_RUN_JOB) return;

  const { format } = await import('node:util');

  const wrap = (
    original: (...args: unknown[]) => void,
    severity: 'ERROR' | 'WARNING',
  ) =>
    (...args: unknown[]): void => {
      try {
        // format() renders errors with stacks exactly like console.error
        // would; JSON.stringify escapes the newlines, so the whole event
        // stays one physical line → one Cloud Logging entry.
        original(JSON.stringify({ severity, message: format(...args) }));
      } catch {
        original(...args);
      }
    };

  console.error = wrap(console.error.bind(console), 'ERROR');
  console.warn = wrap(console.warn.bind(console), 'WARNING');
}
