import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Returns all distinct type+label pairs accumulated in staff_metadata.
// Used to power datalist suggestions in the editor — vocabulary grows
// automatically as new entries are added, no explicit taxonomy needed.
export async function GET() {
  const rows = await prisma.staffMetadata.findMany({
    select: { type: true, label: true },
    distinct: ['type', 'label'],
    orderBy: [{ type: 'asc' }, { label: 'asc' }],
  });

  const types = Array.from(new Set(rows.map((r) => r.type)));

  const labelsByType: Record<string, string[]> = {};
  for (const { type, label } of rows) {
    (labelsByType[type] ??= []).push(label);
  }

  return NextResponse.json({ types, labelsByType });
}
