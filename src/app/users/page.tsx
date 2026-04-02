import { prisma } from '@/lib/prisma';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      email: true,
      displayName: true,
      role: true,
      isAdmin: true,
      isActive: true,
      createdAt: true,
      staffProfile: { select: { id: true, fullName: true } },
    },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Users</h1>
        <Link
          href="/users/new"
          className="text-sm bg-gray-900 text-white px-3 py-1.5 rounded hover:bg-gray-700"
        >
          + Add User
        </Link>
      </div>
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Role</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Staff</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Admin</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <Link href={`/users/${u.id}`} className="text-blue-600 hover:underline">
                    {u.email}
                  </Link>
                </td>
                <td className="px-4 py-3 text-gray-700">{u.displayName ?? '—'}</td>
                <td className="px-4 py-3 text-gray-700">{u.role}</td>
                <td className="px-4 py-3 text-gray-700">
                  {u.staffProfile ? (
                    <Link href={`/staff/${u.staffProfile.id}`} className="text-blue-600 hover:underline">
                      {u.staffProfile.fullName}
                    </Link>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${u.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {u.isActive ? 'active' : 'inactive'}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-700">{u.isAdmin ? 'yes' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
