/**
 * /api/data-sources/google_drive/scheduler — Drive poll cadence editor.
 *
 *   GET  → returns the current Cloud Scheduler job state (cron, state,
 *          last attempt). The Drive settings page reads this on every
 *          render so what's displayed reflects what's deployed.
 *   POST → updates the Cloud Scheduler cron. Body: { cadence: <preset
 *          key> }. Validated against the presets in src/lib/drive-cadence.ts
 *          so an admin can't type a freeform cron — the UI exposes only
 *          those choices.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireActor } from '@/lib/actor';
import { getDrivePollJob, updateDrivePollSchedule } from '@/lib/cloud-scheduler';
import { CADENCE_KEYS, CADENCE_PRESETS, matchCadencePreset } from '@/lib/drive-cadence';

const SchedulerUpdateSchema = z
  .object({
    cadence: z.enum(CADENCE_KEYS),
  })
  .strict();

export async function GET() {
  try {
    const job = await getDrivePollJob();
    // Identify which preset (if any) the live cron matches. UI renders the
    // matched key as the selected dropdown value; if no preset matches
    // (someone edited via gcloud or console), the UI shows "custom" and
    // disables the dropdown until they pick a preset.
    return NextResponse.json({
      job,
      matchedPreset: matchCadencePreset(job),
      presets: CADENCE_PRESETS,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to read Cloud Scheduler job', detail: message },
      { status: 502 },
    );
  }
}

export async function POST(request: Request) {
  const actor = await requireActor();
  if ('response' in actor) return actor.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = SchedulerUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const preset = CADENCE_PRESETS[parsed.data.cadence];
  try {
    const job = await updateDrivePollSchedule({
      schedule: preset.schedule,
      timeZone: preset.timeZone,
    });
    return NextResponse.json({ job, matchedPreset: parsed.data.cadence });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to update Cloud Scheduler job', detail: message },
      { status: 502 },
    );
  }
}
