import { prisma } from '@/lib/prisma';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import UserEditForm from './UserEditForm';

export const dynamic = 'force-dynamic';

export default async function UserDetailPage({ params }: { params: { id: string } }) {
  const user = await prisma.user.findUnique({
    where: { id: params.id },
    include: {
      staffProfile: true,
      permissions: true,
      accessGrants: { where: { revokedAt: null }, orderBy: { grantedAt: 'desc' } },
    },
  });

  if (!user) notFound();

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <Link href="/users" className="text-sm text-gray-500 hover:text-gray-700">← Users</Link>
        <h1 className="text-xl font-semibold mt-2">{user.email}</h1>
        <p className="text-sm text-gray-500">{user.id}</p>
      </div>

      <UserEditForm user={{
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        isAdmin: user.isAdmin,
        isActive: user.isActive,
      }} />

      {user.staffProfile && (
        <div className="mt-6 p-4 bg-white border border-gray-200 rounded-lg">
          <div className="text-xs font-medium text-gray-500 uppercase mb-2">Staff Profile</div>
          <Link href={`/staff/${user.staffProfile.id}`} className="text-sm text-blue-600 hover:underline">
            {user.staffProfile.fullName} — {user.staffProfile.status}
          </Link>
        </div>
      )}

      {user.accessGrants.length > 0 && (
        <div className="mt-6 p-4 bg-white border border-gray-200 rounded-lg">
          <div className="text-xs font-medium text-gray-500 uppercase mb-3">Active Access Grants</div>
          <div className="space-y-1">
            {user.accessGrants.map((g) => (
              <div key={g.id} className="text-sm flex gap-3">
                <span className="text-gray-400 font-mono text-xs">{g.resourceType}</span>
                <span className="text-gray-700 font-mono text-xs truncate">{g.resourceId}</span>
                <span className="text-gray-500">{g.role}</span>
              </div>
            ))}
          </div>
          <Link href={`/grants?userId=${user.id}`} className="mt-3 block text-xs text-blue-600 hover:underline">
            Manage grants →
          </Link>
        </div>
      )}
    </div>
  );
}
