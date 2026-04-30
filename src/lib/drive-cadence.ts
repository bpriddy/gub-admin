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
} as const;

export type CadenceKey = keyof typeof CADENCE_PRESETS;
