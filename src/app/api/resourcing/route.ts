import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type       = searchParams.get('type');
  const label      = searchParams.get('label')    ?? undefined;
  const value      = searchParams.get('value')    ?? undefined;
  const featured   = searchParams.get('featured');

  if (!type) {
    return NextResponse.json({ error: '?type= is required' }, { status: 400 });
  }

  const isFeatured = featured === 'true' ? true : featured === 'false' ? false : undefined;

  const rows = await prisma.staffMetadata.findMany({
    where: {
      type,
      ...(label      ? { label: { contains: label, mode: 'insensitive' } } : {}),
      ...(value      ? { value }      : {}),
      ...(isFeatured !== undefined ? { isFeatured } : {}),
    },
    include: {
      staff: { select: { id: true, fullName: true, email: true, title: true, status: true } },
    },
    orderBy: [{ staff: { fullName: 'asc' } }, { label: 'asc' }],
  });

  // Group by staff member
  const byStaff = new Map<string, {
    staffId: string; fullName: string; email: string; title: string | null; status: string;
    entries: typeof rows;
  }>();

  for (const row of rows) {
    if (!byStaff.has(row.staffId)) {
      byStaff.set(row.staffId, {
        staffId:  row.staff.id,
        fullName: row.staff.fullName,
        email:    row.staff.email,
        title:    row.staff.title,
        status:   row.staff.status,
        entries:  [],
      });
    }
    byStaff.get(row.staffId)!.entries.push(row);
  }

  return NextResponse.json(Array.from(byStaff.values()));
}
