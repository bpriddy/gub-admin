/**
 * drive-cadence.ts — shared preset definitions for the Drive poll cadence.
 *
 * Lives outside the Next.js route file (src/app/api/.../route.ts) because
 * Next.js only allows specific named exports from route files; non-route
 * exports trigger a build error. The presets are imported by the route
 * (for the allow-list) AND the detail page (to render the dropdown).
 *
 * Add a preset here, the route + page pick it up automatically.
 */

export const CADENCE_PRESETS = {
  '1h': { schedule: '0 * * * *', timeZone: 'America/New_York', label: 'Every 1 hour' },
  '2h': { schedule: '0 */2 * * *', timeZone: 'America/New_York', label: 'Every 2 hours' },
  '6h': { schedule: '0 */6 * * *', timeZone: 'America/New_York', label: 'Every 6 hours' },
  '12h': { schedule: '0 */12 * * *', timeZone: 'America/New_York', label: 'Every 12 hours' },
  '24h': { schedule: '0 7 * * *', timeZone: 'America/New_York', label: 'Daily at 7am ET' },
  '7d': { schedule: '0 7 * * 1', timeZone: 'America/New_York', label: 'Weekly, Mondays at 7am ET' },
} as const;

export type CadenceKey = keyof typeof CADENCE_PRESETS;

/** Every preset key, as the non-empty tuple z.enum takes (the route's allow-list). */
export const CADENCE_KEYS = Object.keys(CADENCE_PRESETS) as [CadenceKey, ...CadenceKey[]];

/** Shown under the dropdown while the preset is selected: what changes besides the time. */
export const CADENCE_NOTES: Partial<Record<CadenceKey, string>> = {
  '7d': "Weekly runs scan 7 days of Drive activity at once: larger model batches per account and campaign, and the week's edit counts dated by the run day. Check the cadence notes in the drive-sync runbook before switching.",
};

/**
 * The preset a live job runs on, or null for a custom cron. The time zone
 * must match too: the same cron in another zone fires at another hour, so
 * it is shown as custom rather than under a preset's label.
 */
export function matchCadencePreset(job: { schedule: string; timeZone: string }): CadenceKey | null {
  return (
    CADENCE_KEYS.find(
      (k) =>
        CADENCE_PRESETS[k].schedule === job.schedule &&
        CADENCE_PRESETS[k].timeZone === job.timeZone,
    ) ?? null
  );
}
