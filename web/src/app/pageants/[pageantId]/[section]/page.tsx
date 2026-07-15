import Link from "next/link";
import { ArrowLeft, BarChart3, CircleAlert, Sparkles } from "lucide-react";
import { findPlatformPageant } from "@/lib/platform-api";

const sections: Record<string, { title: string; description: string }> = {
  predict: {
    title: "Prediction markets",
    description: "Testnet market configuration, eligibility, staking, resolution, and settlement are not yet accepted end to end.",
  },
  results: {
    title: "Results and verification",
    description: "Durable tally snapshots, Stellar anchoring, indexing, and independent proof verification remain under active implementation.",
  },
};

export default async function PageantSectionPreview({
  params,
}: {
  params: Promise<{ pageantId: string; section: string }>;
}) {
  const { pageantId, section } = await params;
  const found = await findPlatformPageant(pageantId);
  const content = sections[section];

  if (!found || !content) {
    return (
      <section className="mx-auto max-w-xl rounded-3xl border border-dashed border-gold/25 bg-black/30 p-10 text-center">
        <CircleAlert className="mx-auto text-gold" size={28} />
        <h1 className="mt-4 font-display text-3xl font-semibold text-white">Pageant section unavailable</h1>
        <Link href="/platform" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-gold"><ArrowLeft size={16} /> Explore pageants</Link>
      </section>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href={`/platform/pageants/${pageantId}`} className="inline-flex items-center gap-2 text-sm text-gold-soft/55 hover:text-gold">
        <ArrowLeft size={16} /> {found.pageant.name}
      </Link>
      <section className="rounded-[2rem] border border-gold/25 bg-[radial-gradient(circle_at_top_right,rgba(212,175,55,0.2),transparent_45%),rgba(7,7,9,0.95)] p-8 sm:p-12">
        <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-amber-100/80">
          <Sparkles size={14} /> Testnet development preview
        </div>
        <h1 className="mt-5 font-display text-4xl font-semibold text-white">{content.title}</h1>
        <p className="mt-4 text-sm leading-7 text-gold-soft/60">{content.description}</p>
        <div className="mt-7 rounded-2xl border border-line bg-black/30 p-5 text-sm leading-6 text-gold-soft/55">
          <BarChart3 className="mr-2 inline text-gold" size={17} />
          This page intentionally reports incomplete status instead of displaying a fake successful blockchain workflow. It becomes actionable only after its milestone has durable state and human acceptance evidence.
        </div>
      </section>
    </div>
  );
}
