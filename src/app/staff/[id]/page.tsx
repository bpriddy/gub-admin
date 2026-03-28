import { prisma } from '@/lib/prisma';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import StaffForm from '../StaffForm';

export const dynamic = 'force-dynamic';

export default async function StaffDetailPage({ params }: { params: { id: string } }) {
  const staff = await prisma.staff.findUnique({
    where: { id: params.id },
    include: { user: { select: { id: true, email: true } } },
  });

  if (!staff) notFound();

  return (
    <div className="max-w-lg">
      <div className="mb-6">
        <Link href="/staff" className="text-sm text-gray-500 hover:text-gray-700">← Staff</Link>
        <h1 className="text-xl font-semibold mt-2">{staff.fullName}</h1>
        <p className="text-sm text-gray-500">{staff.id}</p>
        {staff.user && (
          <p className="text-xs text-gray-400 mt-1">
            Linked user: <Link href={`/users/${staff.user.id}`} className="text-blue-600 hover:underline">{staff.user.email}</Link>
          </p>
        )}
      </div>

      <StaffForm staff={{
        ...staff,
        startedAt: staff.startedAt,
        endedAt: staff.endedAt,
      }} />
    </div>
  );
}
