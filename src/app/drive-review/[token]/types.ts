/**
 * Types mirroring the GUB backend's ReviewSession shape.
 *
 * Kept here (not imported from the backend SDK) because the review page
 * is a magic-link UI for Drive proposals — the backend's drive.review.ts
 * owns the canonical types, and they're stable. If the backend changes
 * the wire shape, this file must match.
 *
 * Source: gcp-universal-backend/src/modules/integrations/google-drive/drive.review.ts
 */

export interface Reviewer {
  id: string;
  email: string;
  fullName: string;
}

export interface FieldChangeItem {
  proposalId: string;
  entityType: 'account' | 'campaign';
  entityId: string;
  entityName: string;
  property: string;
  currentValue: unknown;
  proposedValue: unknown;
  reasoning: string | null;
  confidence: number | null;
  sourceFileIds: string[];
  expiresAt: string;
  createdAt: string;
}

export interface NewEntityGroupField {
  proposalId: string;
  property: string;
  proposedValue: unknown;
}

export interface NewEntityGroup {
  proposalGroupId: string;
  entityType: 'account' | 'campaign';
  parentAccountId: string | null;
  parentAccountName: string | null;
  sourceDriveFolderId: string;
  fields: NewEntityGroupField[];
  reasoning: string | null;
  confidence: number | null;
  sourceFileIds: string[];
  expiresAt: string;
  createdAt: string;
}

export interface ReviewSession {
  reviewer: Reviewer;
  fieldChanges: FieldChangeItem[];
  newEntityGroups: NewEntityGroup[];
  entitySnapshots: Record<string, Record<string, string | null>>;
  proposalTtlDays: number | null;
}

export type Decision =
  | {
      proposalId: string;
      decision: 'approve' | 'reject';
      overrideValue?: string | null;
    }
  | {
      proposalGroupId: string;
      decision: 'approve' | 'reject';
      fieldOverrides?: Record<string, string | null>;
    };

export interface ApplyDecisionsResult {
  approved: number;
  rejected: number;
  errors: Array<{ target: string; reason: string }>;
}
