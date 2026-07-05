"use client";
import { useEffect, useState } from "react";
import { Icons } from "@/components/icons";
import { useSession } from "@/session/SessionProvider";
import { short } from "@/lib/format";
import { getJson } from "@/lib/api";

type Round = { id: string; title: string; status: string };

export default function VerifyPage() {
  const { fan } = useSession();
  const [rounds, setRounds] = useState<Round[]>([]);
  const [roundId, setRoundId] = useState("");
  const [result, setResult] = useState<any>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    getJson<Round[]>("/api/rounds", []).then((rs) => {
      setRounds(rs);
      const closed = rs.find((r: any) => r.status === "closed");
      if (closed) setRoundId(closed.id);
    });
  }, []);

  async function verify() {
    if (!fan || !roundId) return;
    setErr(""); setResult(null);
    const res = await fetch(`/api/rounds/${roundId}/receipt?fanId=${fan.id}`);
    const data = await res.json();
    if (!res.ok) { setErr(data.error); return; }
    setResult(data);
  }

  return (
    <div>
      <div className="mb-8">
        <div className="eyebrow mb-2">Proof of vote</div>
        <h1 className="font-display text-4xl font-semibold text-[#23252f]">Verify your receipt</h1>
        <p className="mt-2 text-sm text-[#5f6172]">A Merkle inclusion proof against the root anchored on Stellar. <span className="tag-on ml-1">on-chain</span></p>
      </div>

      <div className="glass max-w-xl p-5">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <select className="field" value={roundId} onChange={(e) => setRoundId(e.target.value)}>
            <option value="">Choose a round...</option>
            {rounds.map((r) => <option key={r.id} value={r.id} className="bg-white">{r.title} ({r.status})</option>)}
          </select>
          <button className="btn-gold" disabled={!fan || !roundId} onClick={verify}>Get receipt</button>
        </div>
        {!fan && <p className="mt-3 text-xs text-[#7a7768]">Connect your Freighter wallet (top right) to verify.</p>}
        {err && <p className="mt-3 text-sm text-ruby">{err === "round_not_closed" ? "This round has not been closed and anchored yet." : err === "no_vote_for_fan" ? "No vote found for this account in this round." : err}</p>}
      </div>

      {result && (
        <div className="glass mt-6 max-w-2xl p-6">
          <div className="flex items-center gap-3">
            <span className={`grid h-9 w-9 place-items-center rounded-full ${result.verified ? "bg-emerald text-ink" : "bg-ruby text-white"}`}>{result.verified ? <Icons.Check size={18} strokeWidth={2.5} /> : <Icons.X size={18} strokeWidth={2.5} />}</span>
            <div>
              <div className="font-display text-lg text-[#23252f]">{result.verified ? "Verified against the anchored root" : "Verification failed"}</div>
              <div className="text-xs text-[#7a7768]">{result.proof.length} proof steps</div>
            </div>
          </div>
          <dl className="mt-4 space-y-2.5 text-sm">
            {[
              ["Anchor tx", result.anchorTx],
              ["Merkle root", result.merkleRoot],
              ["Your leaf", result.leaf],
              ["Leaf index", String(result.index)],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-4 border-b border-white/8 pb-2">
                <dt className="text-[#7a7768]">{k}</dt>
                <dd className="mono text-xs text-[#2a2d3a]">{k.includes("index") ? v : short(v, 10)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}