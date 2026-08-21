/**
 * cloud-scheduler.ts — Thin wrapper over the Cloud Scheduler API for the
 * Drive poll job's cadence editor.
 *
 * Why this lives here:
 *   The Drive sync settings UI in /data-sources/google_drive reads the
 *   cron expression live from Cloud Scheduler (rather than from the DB),
 *   so what's displayed is always what's deployed. The admin saves a new
 *   cadence by calling Cloud Scheduler's update endpoint via this helper.
 *
 * Auth:
 *   Runs server-side via Application Default Credentials (gub-admin's
 *   Cloud Run runtime SA). The runtime SA was granted a narrow custom
 *   role `gubAdminDriveSchedulerEditor` by gcp-universal-backend's
 *   terraform/drive_poll.tf. The role covers cloudscheduler.jobs.{get,
 *   list,update,pause,resume} — pause + resume were added when the
 *   admin UI grew its scheduler control panel (2026-05-20). Any broader
 *   Cloud Scheduler operation (create, delete, run) still 403s — that's
 *   intentional.
 *
 *   Note: "Poll now" from the UI does NOT call scheduler.jobs.run. It
 *   fires the gub-drive-sync Cloud Run Job directly via triggerDriveSync
 *   Job({ mode: 'poll' }) — same execution path Cloud Scheduler uses when
 *   its cron fires, just triggered on demand. That path uses roles/run.
 *   developer on the Job (separate IAM grant), NOT the scheduler role
 *   here — which is why "Poll now" works even when pause/resume don't
 *   (e.g. before the terraform expansion applies).
 *
 * Resource path resolution:
 *   The job's full GCP resource path is
 *     projects/{project}/locations/{region}/jobs/{name}
 *   Project + region default to the values in cloudbuild/<env>.yaml
 *   substitutions (GCP_PROJECT_ID env var; us-central1 hardcoded since
 *   that's the only region the platform uses today). Job name follows
 *   the convention `drive-poll-${env}` and is overridable via env.
 */

import { google } from 'googleapis';

const PROJECT_ID =
  process.env['GCP_PROJECT_ID'] ?? 'os-test-491819';

const REGION = process.env['DRIVE_POLL_REGION'] ?? 'us-central1';

const JOB_NAME =
  process.env['DRIVE_POLL_JOB_NAME'] ??
  // Convention: drive-poll-<env>. Falls back to dev when NODE_ENV doesn't
  // tell us anything useful (local dev, etc.).
  `drive-poll-${process.env['DEPLOY_ENV'] ?? 'dev'}`;

export const DRIVE_POLL_RESOURCE = `projects/${PROJECT_ID}/locations/${REGION}/jobs/${JOB_NAME}`;

/** Lazy client — built on first call, cached after. ADC reads at first use. */
let cachedClient: ReturnType<typeof google.cloudscheduler> | null = null;

function client() {
  if (cachedClient) return cachedClient;
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
  cachedClient = google.cloudscheduler({ version: 'v1', auth });
  return cachedClient;
}

export interface DrivePollJobInfo {
  name: string;
  schedule: string;
  timeZone: string;
  state: string; // 'ENABLED' | 'PAUSED' | 'DISABLED' | etc.
  lastAttemptTime: string | null;
}

/**
 * Read the current Drive poll job's schedule + state from Cloud Scheduler.
 * Used by the Drive settings page on every render — "displayed = deployed."
 *
 * Throws on API errors. Caller should render an error surface rather than
 * silently falling back to a stale value.
 */
export async function getDrivePollJob(): Promise<DrivePollJobInfo> {
  const c = client();
  const res = await c.projects.locations.jobs.get({ name: DRIVE_POLL_RESOURCE });
  const j = res.data;
  if (!j.schedule || !j.timeZone || !j.state) {
    throw new Error(
      `Cloud Scheduler returned incomplete job for ${DRIVE_POLL_RESOURCE}: ${JSON.stringify(j)}`,
    );
  }
  return {
    name: j.name ?? JOB_NAME,
    schedule: j.schedule,
    timeZone: j.timeZone,
    state: j.state,
    lastAttemptTime: j.lastAttemptTime ?? null,
  };
}

/**
 * Pause the Drive poll job. Cloud Scheduler's own state flips to
 * 'PAUSED'; existing in-flight executions are unaffected (Cloud
 * Scheduler doesn't cancel a fire that's already dispatched — pause
 * just stops future ticks). Idempotent — pausing a paused job is a
 * no-op that returns the current state.
 */
export async function pauseDrivePollJob(): Promise<DrivePollJobInfo> {
  const c = client();
  const res = await c.projects.locations.jobs.pause({ name: DRIVE_POLL_RESOURCE });
  return normalizeJob(res.data);
}

/**
 * Resume a paused Drive poll job. Next tick fires on the existing cron.
 * Idempotent.
 */
export async function resumeDrivePollJob(): Promise<DrivePollJobInfo> {
  const c = client();
  const res = await c.projects.locations.jobs.resume({ name: DRIVE_POLL_RESOURCE });
  return normalizeJob(res.data);
}

/** Shared shape-check + coerce for the four endpoints that return a Job. */
function normalizeJob(j: {
  name?: string | null;
  schedule?: string | null;
  timeZone?: string | null;
  state?: string | null;
  lastAttemptTime?: string | null;
}): DrivePollJobInfo {
  if (!j.schedule || !j.timeZone || !j.state) {
    throw new Error(
      `Cloud Scheduler returned incomplete job: ${JSON.stringify(j)}`,
    );
  }
  return {
    name: j.name ?? JOB_NAME,
    schedule: j.schedule,
    timeZone: j.timeZone,
    state: j.state,
    lastAttemptTime: j.lastAttemptTime ?? null,
  };
}

/**
 * Update the Drive poll job's cron expression. Optionally also updates the
 * time zone. Uses the Cloud Scheduler PATCH endpoint with an updateMask so
 * we only modify the fields we mean to.
 *
 * Throws on permission errors (403 — IAM grant missing) or invalid cron
 * (400). Caller should surface these to the admin UI.
 */
export async function updateDrivePollSchedule(opts: {
  schedule: string;
  timeZone?: string;
}): Promise<DrivePollJobInfo> {
  const c = client();
  const updateMask = opts.timeZone ? 'schedule,timeZone' : 'schedule';
  const requestBody: { schedule: string; timeZone?: string } = {
    schedule: opts.schedule,
  };
  if (opts.timeZone) requestBody.timeZone = opts.timeZone;

  const res = await c.projects.locations.jobs.patch({
    name: DRIVE_POLL_RESOURCE,
    updateMask,
    requestBody,
  });
  const j = res.data;
  if (!j.schedule || !j.timeZone || !j.state) {
    throw new Error(
      `Cloud Scheduler returned incomplete job after patch: ${JSON.stringify(j)}`,
    );
  }
  return {
    name: j.name ?? JOB_NAME,
    schedule: j.schedule,
    timeZone: j.timeZone,
    state: j.state,
    lastAttemptTime: j.lastAttemptTime ?? null,
  };
}
