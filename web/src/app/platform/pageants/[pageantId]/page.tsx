import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageantHomeRoute } from "@/components/pageant/PageantHomeRoute";
import {
  findPlatformPageant,
  platformGet,
  type PlatformCategory,
  type PlatformContestant,
} from "@/lib/platform-api";

export default async function PlatformPageantPage({
  params,
  searchParams,
}: {
  params: Promise<{ pageantId: string }>;
  searchParams: Promise<{ editorPreview?: string }>;
}) {
  const { pageantId } = await params;
  const query = await searchParams;
  const found = await findPlatformPageant(pageantId);

  if (!found) {
    return (
      <div className="mx-auto max-w-xl rounded-3xl border border-dashed border-gold/25 bg-black/25 px-6 py-14 text-center">
        <h1 className="font-display text-3xl font-semibold text-white">Pageant not found</h1>
        <p className="mt-3 text-sm leading-6 text-gold-soft/55">
          The platform API did not return this pageant. It may have been archived or the database may be unavailable.
        </p>
        <Link href="/platform" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-gold hover:text-white">
          <ArrowLeft size={16} /> Explore all pageants
        </Link>
      </div>
    );
  }

  const [categories, contestants] = await Promise.all([
    platformGet<PlatformCategory[]>(`/platform/pageants/${pageantId}/categories`, []),
    platformGet<PlatformContestant[]>(`/platform/pageants/${pageantId}/contestants`, []),
  ]);
  const { organization, pageant } = found;

  return (
    <PageantHomeRoute
      pageant={pageant}
      organizationName={organization.name}
      contestants={contestants}
      categories={categories}
      editorPreview={query.editorPreview === "1"}
    />
  );
}
