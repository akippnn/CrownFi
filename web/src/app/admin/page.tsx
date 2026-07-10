"use client";
import { useEffect, useState } from "react";
import { Icons } from "@/components/icons";
import { useSession } from "@/session/SessionProvider";
import { flag, short } from "@/lib/format";
import { Toast } from "@/components/ui";
import { getJson, postJson } from "@/lib/api";
import { signAdminMessage, signWithFreighter } from "@/wallet/freighter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui-kit";

type Tab = "overview" | "rounds" | "contestants" | "requests";

export default function AdminPage() {
  const { isAdmin, address, connect, connecting } = useSession();
  const [tab, setTab] = useState<Tab>("overview");
  const [stats, setStats] = useState<any>(null);
  const [rounds, setRounds] = useState<any[]>([]);
  const [contestants, setContestants] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [busy, setBusy] = useState("");
  const [toast, setToast] = useState({ msg: "", tone: "ok" as "ok" | "err" });

  function loadAll() {
    getJson("/api/stats", null).then(setStats);
    getJson<any[]>("/api/rounds", []).then(setRounds);
    getJson<any[]>("/api/contestants", []).then(setContestants);
    getJson<any[]>("/api/organizer-requests", []).then(setRequests);
  }
  useEffect(() => { if (isAdmin) loadAll(); }, [isAdmin]);

  function flash(msg: string, tone: "ok" | "err" = "ok") { setToast({ msg, tone }); setTimeout(() => setToast({ msg: "", tone }), 2600); }

  async function ensureAdminSession(): Promise<boolean> {
    if (!address) { flash("Connect your admin wallet first.", "err"); return false; }

    const challenge = await postJson<any>("/api/admin/challenge", { address });
    if (!challenge.ok) { flash("Admin wallet is not authorized server-side.", "err"); return false; }

    const signed = await signAdminMessage((challenge.data as any).message, address);
    if (signed.error || !signed.signature) { flash(signed.error ?? "Admin signature was cancelled.", "err"); return false; }

    const verified = await postJson<any>("/api/admin/verify", {
      address,
      message: (challenge.data as any).message,
      signature: signed.signature,
    });
    if (!verified.ok) { flash("Could not verify admin signature.", "err"); return false; }
    return true;
  }


  async function closeRound(id: string) {
    if (!(await ensureAdminSession())) return;
    setBusy(id);
    try {
      // Step 1 — compute the tally + build the anchor tx.
      const prep = await postJson<any>(`/api/rounds/${id}/prepare-close`, { adminAddress: address! });
      if (!prep.ok) throw new Error((prep.data as any)?.error ?? "prepare_failed");

      if ((prep.data as any).mock) {
        const r = await postJson<any>(`/api/rounds/${id}/close`, {});
        if (!r.ok) throw new Error((r.data as any)?.error ?? "close_failed");
        flash(`Round anchored (mock). Root ${short((r.data as any).merkleRoot, 6)}`, "ok");
        return;
      }

      // Step 2 — admin signs the anchor in Freighter.
      const signed = await signWithFreighter((prep.data as any).xdr, address!);
      if (signed.error || !signed.signedXdr) throw new Error(signed.error ?? "You cancelled the signature.");

      // Step 3 — submit + persist.
      const conf = await postJson<any>(`/api/rounds/${id}/confirm-close`, { signedXdr: signed.signedXdr, intentId: (prep.data as any).intentId });
      if (!conf.ok) throw new Error((conf.data as any)?.error ?? "confirm_failed");

      flash(`Anchored on Stellar ✓ Root ${short((conf.data as any).merkleRoot, 6)}`, "ok");
    } catch (e: any) {
      const m = String(e?.message ?? "");
      flash(
        m.includes("already published") ? "This round is already anchored on-chain."
          : m.includes("auth") || m.includes("require") ? "Connect the wallet that is the audit-anchor admin (alice)."
          : `Could not anchor: ${m}`,
        "err"
      );
    } finally {
      setBusy(""); loadAll();
    }
  }
  async function createRound(title: string) {
    if (!(await ensureAdminSession())) return;
    const res = await fetch("/api/rounds", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title }) });
    if (res.ok) { loadAll(); flash("Round created"); } else flash("Could not create round", "err");
  }
  async function createContestant(body: any) {
    if (!(await ensureAdminSession())) return;
    const res = await fetch("/api/contestants", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json();
    if (res.ok) { loadAll(); flash("Contestant added"); } else flash(data.error ?? "Error", "err");
  }
  async function decideRequest(id: string, status: string) {
    if (!(await ensureAdminSession())) return;
    const res = await fetch("/api/organizer-requests", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, status }) });
    if (res.ok) { loadAll(); flash(status === "approved" ? "Organizer approved" : "Request rejected"); } else flash("Error", "err");
  }

  if (!isAdmin) {
    return (
      <div className="glass mx-auto max-w-md p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full surface-soft text-[#a97f16]"><Icons.Lock size={22} strokeWidth={1.75} /></div>
        <h1 className="mt-3 font-display text-2xl text-ink dark:text-white">Admin area</h1>
        <p className="mt-2 text-sm text-ink/75 dark:text-gold-soft/75">Connect an allowlisted admin wallet to manage rounds, contestants, and anchoring.</p>
        <button className="btn-gold mt-4" onClick={() => connect()}>{connecting ? "Connecting..." : "Connect admin wallet"}</button>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="eyebrow mb-2">Organizer console</div>
          <h1 className="font-display text-4xl font-semibold text-ink dark:text-white">Admin</h1>
        </div>
        <div className="flex gap-1 rounded-full border border-line bg-cream dark:bg-gold/10 p-1">
          {(["overview", "rounds", "contestants", "requests"] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`rounded-full px-4 py-1.5 text-sm capitalize transition ${tab === t ? "bg-gold text-ink font-semibold" : "text-ink/65 hover:text-ink dark:text-gold-soft/75 dark:hover:text-white"}`}>{t}</button>
          ))}
        </div>
      </div>

      {tab === "overview" && <Overview stats={stats} />}
      {tab === "rounds" && <Rounds rounds={rounds} busy={busy} onClose={closeRound} onCreate={createRound} />}
      {tab === "contestants" && <Contestants contestants={contestants} onCreate={createContestant} />}
      {tab === "requests" && <Requests requests={requests} onDecide={decideRequest} />}

      <Toast msg={toast.msg} tone={toast.tone} />
    </div>
  );
}

function Overview({ stats }: { stats: any }) {
  const cards = [
    { label: "Votes cast", v: stats?.votes ?? 0 },
    { label: "Tickets minted", v: stats?.tickets ?? 0 },
    { label: "Collectibles sold", v: stats?.collectiblesSold ?? 0 },
    { label: "Contestants", v: stats?.contestants ?? 0 },
    { label: "Rounds", v: stats?.rounds ?? 0 },
    { label: "GMV (USDC)", v: stats?.gmv ?? 0 },
  ];
  const top = stats?.topContestants ?? [];
  const max = Math.max(1, ...top.map((t: any) => t.votes));
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {cards.map((c) => (
          <Card key={c.label} className="border-gold/15 bg-navy-2/40">
            <CardContent className="p-4 text-left">
              <div className="font-display text-3xl font-semibold text-gold">{c.v.toLocaleString?.() ?? c.v}</div>
              <div className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-gold-soft/75">{c.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-gold/15 bg-navy-2/40">
        <CardHeader className="pb-2 border-b border-gold/10">
          <CardTitle className="text-white text-lg font-display uppercase tracking-wider">Vote Leaderboard</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {top.length === 0 ? (
            <p className="text-sm text-gold-soft/50">No votes yet.</p>
          ) : (
            <div className="space-y-4">
              {top.map((t: any) => (
                <div key={t.name} className="flex items-center gap-4">
                  <div className="w-40 shrink-0 truncate text-sm font-semibold text-white/95">
                    {flag(t.sash)} {t.name}
                  </div>
                  <div className="h-3 flex-1 overflow-hidden rounded-full bg-black/40 border border-gold/10">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-gold-deep to-gold"
                      style={{ width: `${(t.votes / max) * 100}%` }}
                    />
                  </div>
                  <div className="w-12 shrink-0 text-right text-sm font-bold text-gold">
                    {t.votes}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Rounds({ rounds, busy, onClose, onCreate }: any) {
  const [title, setTitle] = useState("");
  return (
    <div className="space-y-4">
      <div className="glass flex flex-col gap-3 p-4 sm:flex-row">
        <input className="field" placeholder="New round title (e.g. Grand Finals)" value={title} onChange={(e) => setTitle(e.target.value)} />
        <button className="btn-gold shrink-0" disabled={!title} onClick={() => { onCreate(title); setTitle(""); }}>Create round</button>
      </div>
      {rounds.map((r: any) => (
        <div key={r.id} className="glass flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <div className="font-display text-lg text-ink dark:text-white">{r.title}</div>
            <div className="text-xs text-ink/60 dark:text-gold-soft/60">
              <span className={r.status === "open" ? "text-emerald" : "text-ink/60 dark:text-gold-soft/60"}>{r.status}</span> · {r._count?.votes ?? 0} votes
              {r.checkpoint && <span className="mono ml-2 text-emerald">root {short(r.checkpoint.merkleRoot, 6)}</span>}
            </div>
          </div>
          <button className="btn-gold" disabled={r.status === "closed" || busy === r.id} onClick={() => onClose(r.id)}>
            {busy === r.id ? "Anchoring..." : r.status === "closed" ? "Anchored" : "Close + anchor"}
          </button>
        </div>
      ))}
    </div>
  );
}

function Contestants({ contestants, onCreate }: any) {
  const [f, setF] = useState({ name: "", country: "", sash: "" });
  return (
    <div className="space-y-4">
      <div className="glass grid gap-3 p-4 sm:grid-cols-[1fr_1fr_auto_auto]">
        <input className="field" placeholder="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <input className="field" placeholder="Country" value={f.country} onChange={(e) => setF({ ...f, country: e.target.value })} />
        <input className="field sm:w-24" placeholder="Sash (PH)" maxLength={2} value={f.sash} onChange={(e) => setF({ ...f, sash: e.target.value.toUpperCase() })} />
        <button className="btn-gold shrink-0" disabled={!f.name || !f.country || f.sash.length !== 2} onClick={() => { onCreate(f); setF({ name: "", country: "", sash: "" }); }}>Add</button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {contestants.map((c: any) => (
          <div key={c.id} className="glass flex items-center gap-3 p-4">
            <span className="text-2xl">{flag(c.sash)}</span>
            <div>
              <div className="font-medium text-ink dark:text-white">{c.name}</div>
              <div className="text-xs text-ink/60 dark:text-gold-soft/60">{c.country} · {c.sash}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Requests({ requests, onDecide }: any) {
  return (
    <div className="space-y-3">
      {requests.length === 0 && <div className="glass p-6 text-center text-ink/60 dark:text-gold-soft/60">No organizer requests yet.</div>}
      {requests.map((r: any) => (
        <div key={r.id} className="glass p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="font-display text-lg text-ink dark:text-white">{r.pageantName}</div>
              <div className="text-xs text-ink/60 dark:text-gold-soft/60">{r.orgName} · {r.country} · {r.contactName} ({r.email})</div>
              {r.message && <p className="mt-2 max-w-xl text-sm text-ink/75 dark:text-gold-soft/75">{r.message}</p>}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {r.status === "pending" ? (
                <>
                  <button className="btn-gold !px-3 !py-1.5" onClick={() => onDecide(r.id, "approved")}>Approve</button>
                  <button className="btn-ghost !px-3 !py-1.5" onClick={() => onDecide(r.id, "rejected")}>Reject</button>
                </>
              ) : (
                <span className={r.status === "approved" ? "tag-on" : "tag-off"}>{r.status}</span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}