/**
 * Default prompt-template version stamped onto enqueued research_jobs.
 *
 * gub-admin only NAMES the version — the actual prompt rendering lives in
 * the gub-research-worker repo. This string MUST match a template the
 * worker implements (worker's TALENT_DOSSIER_V1_VERSION). If they drift,
 * the worker's provider throws a loud, safe error
 * ("Only <v> is implemented; got <x>") rather than producing a wrong
 * dossier — so a mismatch fails closed, but keep them in sync.
 */
export const DEFAULT_PROMPT_TEMPLATE_VERSION = 'talent-dossier-v1';
