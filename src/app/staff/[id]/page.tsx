import { prisma } from '@/lib/prisma';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import StaffForm from '../StaffForm';
import MetadataPanel from './MetadataPanel';

export const dynamic = 'force-dynamic';

export default async function StaffDetailPage({ params }: { params: { id: string } }) {
  const [staff, offices] = await Promise.all([
    prisma.staff.findUnique({
      where: { id: params.id },
      include: { user: { select: { id: true, email: true } } },
    }),
    prisma.office.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ]);

  if (!staff) notFound();

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <Link href="/staff" className="text-sm text-gray-500 hover:text-gray-700">← Staff</Link>
        <h1 className="text-xl font-semibold mt-2">{staff.fullName}</h1>
        <p className="text-sm text-gray-500">{staff.title ?? '—'}</p>
        {staff.user && (
          <p className="text-xs text-gray-400 mt-1">
            Linked user:{' '}
            <Link href={`/users/${staff.user.id}`} className="text-blue-600 hover:underline">
              {staff.user.email}
            </Link>
          </p>
        )}
      </div>

      {/* Profile details */}
      <div className="mb-8">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Profile</h2>
        <StaffForm staff={staff} offices={offices} />
      </div>

      {/* Metadata: skills, interests, work highlights, etc. */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Skills & metadata</h2>
          <Link
            href="/resourcing"
            className="text-xs text-blue-600 hover:underline"
          >
            Resourcing search →
          </Link>
        </div>
        <MetadataPanel staffId={params.id} />
      </div>
    </div>
  );
}
