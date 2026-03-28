// Shared types for gub-admin

export type UserRow = {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
  isAdmin: boolean;
  isActive: boolean;
  createdAt: Date;
};

export type StaffRow = {
  id: string;
  userId: string | null;
  fullName: string;
  email: string;
  title: string | null;
  department: string | null;
  status: string;
  startedAt: Date;
  endedAt: Date | null;
};

export type AccountRow = {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CampaignRow = {
  id: string;
  accountId: string;
  name: string;
  status: string;
  budget: string | null;
  assetsUrl: string | null;
  awardedAt: Date | null;
  liveAt: Date | null;
  endsAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type AccessGrantRow = {
  id: string;
  userId: string;
  resourceType: string;
  resourceId: string;
  role: string;
  grantedBy: string;
  grantedAt: Date;
  expiresAt: Date | null;
  revokedAt: Date | null;
};

export type ApiError = {
  error: string;
};
