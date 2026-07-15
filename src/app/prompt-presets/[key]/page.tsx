import { prisma } from '@/lib/prisma';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import PresetEditor from './editor';

export const dynamic = 'force-dynamic';

export default async function PromptPresetDetailPage({ params }: { params: { key: string } }) {
  let key: string;
  try {
    key = decodeURIComponent(params.key);
  } catch {
    notFound();
  }
  const preset = await prisma.promptPreset.findUnique({
    where: { key },
    include: { updatedByStaff: { select: { fullName: true } } },
  });
  if (!preset) notFound();

  return (
    <div>
      <div className="mb-6">
        <Link href="/prompt-presets" className="text-sm text-gray-400 hover:text-gray-600">
          ← Prompt Presets
        </Link>
        <h1 className="text-xl font-semibold font-mono mt-1">{preset.key}</h1>
        <p className="text-sm text-gray-500 mt-1">
          Last updated {preset.updatedAt.toISOString().replace('T', ' ').slice(0, 16)} UTC
          {preset.updatedByStaff ? ` by ${preset.updatedByStaff.fullName}` : ''}
        </p>
      </div>
      <PresetEditor
        presetKey={preset.key}
        initial={{
          description: preset.description,
          model: preset.model,
          temperature: Number(preset.temperature),
          isActive: preset.isActive,
          template: preset.template,
          updatedAt: preset.updatedAt.toISOString(),
        }}
      />
    </div>
  );
}
