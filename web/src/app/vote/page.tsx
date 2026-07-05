"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession } from "@/session/SessionProvider";
import { SpotlightCarousel, Slide } from "@/components/Carousel";
import { Toast } from "@/components/ui";
import { getJson, postJson } from "@/lib/api";

type Round = { id: string; title: string; status: string };

export default function VotePage() {
  const { fan, ready } = useSession();
  const [slides, setSlides] = useState<Slide[]>([]);
  const [round, setRound] = useState<Round | null>(null);
  const [picked, setPicked] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ msg: string; tone: "ok" | "err" }>({ msg: "", tone: "ok" });

  useEffect(() => {
    getJson<any[]>("/api/contestants", []).then((cs) =>
      setSlides(cs.map((c: any) => ({ id: c.id, name: c.name, country: c.country, sash: c.sash }))));
    getJson<Round[]>("/api/rounds", []).then((rs) =>
      setRound(rs.find((x: Round) => x.status === "open") ?? rs[0] ?? null));
  }, []);

  function flash(msg: string, tone: "ok" | "err") {
    setToast({ msg, tone });
    setTimeout(() => setToast({ msg: "", tone }), 2600);
  }

  async function cast() {
    if (!fan || !round || !picked) return;
    setBusy(true);
    const { ok, data } = await postJson<{ error?: string }>("/api/vote", { roundId: round.id, fanId: fan.id, contestantId: picked });
    setBusy(false);
    const err = (data as any)?.error;
    if (ok) flash("Vote recorded. Verify it once the round closes.", "ok");
    else if (err === "duplicate_vote" || err === "quota_reached") flash("You have already voted in this round.", "err");
    else if (err === "db_unavailable") flash("Database isn't set up yet — see SUPABASE.md.", "err");
    else flash(`Could not vote${err ? `: ${err}` : "."}`, "err");
  }

  return (
    <div>
      <div className="mb-8">
        <div className="eyebrow mb-2">Cast your vote</div>
        <h1 className="font-display text-4xl font-semibold text-[#23252f]">Who wears the crown?</h1>
        <p className="mt-2 text-sm text-[#5f6172]">
          {round ? `${round.title} · ${round.status}` : "No active round"}
          <span className="tag-off ml-2">off-chain intake</span>
        </p>
      </div>

      {ready && !fan && (
        <div className="glass mb-6 p-4 text-sm text-[#3a3f52]">Connect your Freighter wallet (top right) to vote.</div>
      )}

      <SpotlightCarousel slides={slides} onSelect={setPicked} selectedId={picked} cta="Pick" />

      <div className="mt-8 flex flex-col items-center gap-3">
        <button className="btn-gold" disabled={busy || !fan || !picked || round?.status !== "open"} onClick={cast}>
          {busy ? "Submitting..." : picked ? "Cast vote" : "Select a contestant"}
        </button>
        <Link href="/verify" className="text-sm text-[#7a7768] underline-offset-4 hover:underline">Already voted? Verify your receipt</Link>
      </div>

      <Toast msg={toast.msg} tone={toast.tone} />
    </div>
  );
}
