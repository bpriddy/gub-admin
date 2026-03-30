import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import StaffForm from '../StaffForm';

export const dynamic = 'force-dynamic';

export default async function NewStaffPage() {
  const offices = await prisma.office.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } });

  return (
    <div className="max-w-lg">
      <div className="mb-6">
        <Link href="/staff" className="text-sm text-gray-500 hover:text-gray-700">← Staff</Link>
        <h1 className="text-xl font-semibold mt-2">Add Staff Member</h1>
      </div>
      <StaffForm offices={offices} />
    </div>
  );
}
