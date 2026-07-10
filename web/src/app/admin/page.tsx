"use client";

import { useEffect, useState } from "react";
import {
  BarChart3,
  CheckCircle2,
  CircleAlert,
  ClipboardList,
  Crown,
  Lock,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trophy,
  Users,
  Vote,
} from "lucide-react";
import { useSession } from "@/session/SessionProvider";
import { flag, short } from "@/lib/format";
import { Toast } from "@/components/ui";
import { getJson, postJson } from "@/lib/api";
import { signAdminMessage, signWithFreighter } from "@/wallet/freighter";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ConfirmModal,
  EmptyState,
  Modal,
  SectionHeader,
  TextField,
} from "@/components/ui-kit";

type Tab = "overview" | "rounds" | "contestants" | "requests";
type Decision = { request: any; status: "approved" | "rejected" } | null;

const tabs: { id: Tab; label: string; Icon: typeof BarChart3 }[] = [
  { id: "overview", label: "Overview", Icon: BarChart3 },
  { id: "rounds", label: "Voting rounds", Icon: Vote },
  { id: "contestants", label: "Contestants", Icon: Users },
  { id: "requests", label: "Organizer applications", Icon: ClipboardList },
];

export default function AdminPage() {
  const { isAdmin, address, connect, connecting, adminAllowlistConfigured } = useSession();
  const [tab, setTab] = useState<Tab>("overview");
  const [stats, setStats] = useState<any>(null);
  const [rounds, setRounds] = useState<any[]>([]);
  const [contestants, setContestants] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [busy, setBusy] = useState("");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState({ msg: "", tone: "ok" as "ok" | "err" });
  const [roundToClose, setRoundToClose] = useState<any | null>(null);
  const [decision, setDecision] = useState<Decision>(null);
  const [roundModal, setRoundModal] = useState(false);
  const [contestantModal, setContestantModal] = useState(false);
  const [roundTitle, setRoundTitle] = useState("");
  const [contestantForm, setContestantForm] = useState({ name: "", country: "", sash: "" });

  function loadAll() {
    setLoading(true);
    Promise.all([
      getJson("/api/stats", null).then(setStats),
      getJson<any[]>("/api/rounds", []).then(setRounds),
      getJson<any[]>("/api/contestants", []).then(setContestants),
      getJson<any[]>("/api/organizer-requests", []).then(setRequests),
    ]).finally(() => setLoading(false));
  }

  useEffect(() => {
    if (isAdmin) loadAll();
  }, [isAdmin]);

  function flash(msg: string, tone: "ok" | "err" = "ok") {
    setToast({ msg, tone });
    setTimeout(() => setToast({ msg: "", tone }), 2800);
  }

  async function ensureAdminSession(): Promise<boolean> {
    if (!address) {
      flash("Connect your admin wallet first.", "err");
      return false;
    }
    const challenge = await postJson<any>("/api/admin/challenge", { address });
    if (!challenge.ok) {
      flash("This wallet is not authorized by the server admin allowlist.", "err");
      return false;
    }
    const signed = await signAdminMessage((challenge.data as any).message, address);
    if (signed.error || !signed.signature) {
      flash(signed.error ?? "Admin signature was cancelled.", "err");
      return false;
    }
    const verified = await postJson<any>("/api/admin/verify", {
      address,
      message: (challenge.data as any).message,
      signature: signed.signature,
    });
    if (!verified.ok) {
      flash("The server could not verify the admin signature.", "err");
      return false;
    }
    return true;
  }

  async function closeRound(id: string) {
    if (!(await ensureAdminSession())) return;
    setBusy(id);
    try {
      const prep = await postJson<any>(`/api/rounds/${id}/prepare-close`, { adminAddress: address! });
      if (!prep.ok) throw new Error((prep.data as any)?.error ?? "prepare_failed");

      if ((prep.data as any).mock) {
        const result = await postJson<any>(`/api/rounds/${id}/close`, {});
        if (!result.ok) throw new Error((result.data as any)?.error ?? "close_failed");
        flash(`Voting closed in demo mode. Root ${short((result.data as any).merkleRoot, 6)}`);
        setRoundToClose(null);
        return;
      }

      const signed = await signWithFreighter((prep.data as any).xdr, address!);
      if (signed.error || !signed.signedXdr) throw new Error(signed.error ?? "You cancelled the signature.");

      const confirmed = await postJson<any>(`/api/rounds/${id}/confirm-close`, {
        signedXdr: signed.signedXdr,
        intentId: (prep.data as any).intentId,
      });
      if (!confirmed.ok) throw new Error((confirmed.data as any)?.error ?? "confirm_failed");

      flash(`Checkpoint published on Stellar. Root ${short((confirmed.data as any).merkleRoot, 6)}`);
      setRoundToClose(null);
    } catch (error: any) {
      const message = String(error?.message ?? "");
      flash(
        message.includes("already published")
          ? "This round already has a published checkpoint."
          : message.includes("auth") || message.includes("require")
            ? "Connect the Stellar account configured as the audit-anchor administrator."
            : `Could not close voting: ${message}`,
        "err",
      );
    } finally {
      setBusy("");
      loadAll();
    }
  }

  async function createRound() {
    if (!roundTitle.trim() || !(await ensureAdminSession())) return;
    setBusy("create-round");
    try {
      const response = await fetch("/api/rounds", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: roundTitle.trim() }),
      });
      if (!response.ok) throw new Error("create_failed");
      flash("Voting round created.");
      setRoundTitle("");
      setRoundModal(false);
      loadAll();
    } catch {
      flash("Could not create the voting round.", "err");
    } finally {
      setBusy("");
    }
  }

  async function createContestant() {
    if (!contestantForm.name || !contestantForm.country || contestantForm.sash.length !== 2 || !(await ensureAdminSession())) return;
    setBusy("create-contestant");
    try {
      const response = await fetch("/api/contestants", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(contestantForm),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "create_failed");
      flash("Contestant added.");
      setContestantForm({ name: "", country: "", sash: "" });
      setContestantModal(false);
      loadAll();
    } catch (error: any) {
      flash(error?.message ?? "Could not add the contestant.", "err");
    } finally {
      setBusy("");
    }
  }

  async function decideRequest() {
    if (!decision || !(await ensureAdminSession())) return;
    setBusy(`request-${decision.request.id}`);
    try {
      const response = await fetch("/api/organizer-requests", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: decision.request.id, status: decision.status }),
      });
      if (!response.ok) throw new Error("decision_failed");
      flash(decision.status === "approved" ? "Organizer application approved." : "Organizer application rejected.");
      setDecision(null);
      loadAll();
    } catch {
      flash("Could not update the organizer application.", "err");
    } finally {
      setBusy("");
    }
  }

  if (!isAdmin) {
    const heading = !address
      ? "Connect an administrator wallet"
      : !adminAllowlistConfigured
        ? "Client admin allowlist is not configured"
        : "This wallet is not an administrator";
    const description = !address
      ? "Administration is protected by a wallet allowlist and a signed server challenge. Connect Freighter to continue."
      : !adminAllowlistConfigured
        ? "Set NEXT_PUBLIC_ADMIN_WALLETS to your public Stellar address, then restart the development server. The server must also use the same address in ADMIN_WALLETS."
        : "The connected address is not present in NEXT_PUBLIC_ADMIN_WALLETS. Add it to both client and server allowlists, then restart the app.";

    return (
      <Card className="mx-auto max-w-2xl border-gold/25">
        <CardContent className="px-6 py-12 text-center sm:px-10">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-full border border-gold/25 bg-gold/10 text-gold"><Lock size={25} /></span>
          <Badge tone="gold" className="mt-5">Restricted administration</Badge>
          <h1 className="mt-4 font-display text-3xl font-semibold text-white">{heading}</h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-gold-soft/50">{description}</p>
          {address && (
            <div className="mx-auto mt-5 max-w-md rounded-2xl border border-line bg-black/25 px-4 py-3 text-left">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gold-soft/40">Connected wallet</div>
              <div className="mono mt-1 break-all text-sm text-gold-soft">{address}</div>
            </div>
          )}
          {!address && <Button className="mt-6" onClick={connect} disabled={connecting}>{connecting ? "Connecting…" : "Connect admin wallet"}</Button>}
          <div className="mt-6 rounded-2xl border border-line bg-black/20 px-4 py-3 text-left text-xs leading-5 text-gold-soft/40">
            <strong className="text-gold-soft/65">Local setup:</strong> configure the same public G-address in <code>NEXT_PUBLIC_ADMIN_WALLETS</code> and <code>ADMIN_WALLETS</code>, plus a strong <code>ADMIN_SESSION_SECRET</code>.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionHeader
          className="mb-0"
          eyebrow="CrownFi administration"
          title="Manage the current CrownFi experience"
          description="Review activity, operate voting rounds, manage contestants, and process organizer applications. Administrative changes require a signed wallet challenge."
        />
        <div className="flex items-center gap-2">
          <Badge tone="success"><ShieldCheck size={13} /> Admin wallet</Badge>
          <Button size="sm" variant="secondary" onClick={loadAll} disabled={loading}><RefreshCw className={loading ? "animate-spin" : ""} size={15} /> Refresh</Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <Card className="h-fit p-2">
          <nav aria-label="Administration sections" className="flex gap-1 overflow-x-auto lg:grid">
            {tabs.map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`flex min-w-max items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition lg:w-full ${tab === id ? "bg-gold text-black" : "text-gold-soft/55 hover:bg-gold/10 hover:text-white"}`}
              >
                <Icon size={17} />
                <span className="font-semibold">{label}</span>
                {id === "requests" && requests.filter((request) => request.status === "pending").length > 0 && (
                  <span className="ml-auto rounded-full bg-black/20 px-2 py-0.5 text-[10px] font-bold">{requests.filter((request) => request.status === "pending").length}</span>
                )}
              </button>
            ))}
          </nav>
        </Card>

        <div className="min-w-0">
          {tab === "overview" && <Overview stats={stats} loading={loading} />}
          {tab === "rounds" && <Rounds rounds={rounds} busy={busy} onClose={setRoundToClose} onCreate={() => setRoundModal(true)} />}
          {tab === "contestants" && <Contestants contestants={contestants} onCreate={() => setContestantModal(true)} />}
          {tab === "requests" && <Requests requests={requests} onDecide={(request, status) => setDecision({ request, status })} />}
        </div>
      </div>

      <Modal
        open={roundModal}
        onClose={() => setRoundModal(false)}
        title="Create voting round"
        description="A new round starts open and can receive votes immediately."
        preventClose={busy === "create-round"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRoundModal(false)} disabled={busy === "create-round"}>Cancel</Button>
            <Button onClick={createRound} disabled={!roundTitle.trim() || busy === "create-round"}>{busy === "create-round" ? "Creating…" : "Create round"}</Button>
          </>
        }
      >
        <TextField id="round-title" label="Round title" helper="Example: Grand Finals or People's Choice" value={roundTitle} onChange={(event) => setRoundTitle(event.target.value)} autoFocus />
      </Modal>

      <Modal
        open={contestantModal}
        onClose={() => setContestantModal(false)}
        title="Add contestant"
        description="Contestants become available to voting and collectible workflows."
        preventClose={busy === "create-contestant"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setContestantModal(false)} disabled={busy === "create-contestant"}>Cancel</Button>
            <Button onClick={createContestant} disabled={!contestantForm.name || !contestantForm.country || contestantForm.sash.length !== 2 || busy === "create-contestant"}>{busy === "create-contestant" ? "Adding…" : "Add contestant"}</Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField id="contestant-name" label="Name" value={contestantForm.name} onChange={(event) => setContestantForm({ ...contestantForm, name: event.target.value })} placeholder="Candidate name" />
          <TextField id="contestant-country" label="Country" value={contestantForm.country} onChange={(event) => setContestantForm({ ...contestantForm, country: event.target.value })} placeholder="Philippines" />
          <TextField id="contestant-sash" label="Two-letter sash code" helper="Used to display the country flag." maxLength={2} value={contestantForm.sash} onChange={(event) => setContestantForm({ ...contestantForm, sash: event.target.value.toUpperCase() })} placeholder="PH" />
        </div>
      </Modal>

      <ConfirmModal
        open={Boolean(roundToClose)}
        onClose={() => setRoundToClose(null)}
        onConfirm={() => roundToClose && closeRound(roundToClose.id)}
        title={roundToClose ? `Close ${roundToClose.title}` : "Close voting round"}
        description="This is a high-impact action and cannot be undone in the MVP."
        confirmLabel="Close and publish checkpoint"
        pendingLabel="Publishing checkpoint…"
        pending={Boolean(roundToClose && busy === roundToClose.id)}
        destructive
      >
        <div className="space-y-4">
          <div className="rounded-2xl border border-ruby/25 bg-ruby/10 px-4 py-3 text-sm leading-6 text-ruby">
            New votes will stop being accepted as soon as the round is closed.
          </div>
          <ol className="space-y-3 text-sm text-gold-soft/55">
            {["Stop new votes", "Calculate the final tally", "Generate the Merkle root and tally hash", "Request an admin signature", "Publish the checkpoint to Stellar or local demo mode"].map((step, index) => (
              <li key={step} className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-gold/20 text-xs text-gold">{index + 1}</span><span className="pt-0.5">{step}</span></li>
            ))}
          </ol>
        </div>
      </ConfirmModal>

      <ConfirmModal
        open={Boolean(decision)}
        onClose={() => setDecision(null)}
        onConfirm={decideRequest}
        title={decision?.status === "approved" ? "Approve organizer application" : "Reject organizer application"}
        description={decision ? `${decision.request.pageantName} · ${decision.request.orgName}` : undefined}
        confirmLabel={decision?.status === "approved" ? "Approve application" : "Reject application"}
        pendingLabel="Updating application…"
        pending={Boolean(decision && busy === `request-${decision.request.id}`)}
        destructive={decision?.status === "rejected"}
      >
        <p className="text-sm leading-6 text-gold-soft/55">
          {decision?.status === "approved"
            ? "Approval records the review decision. It does not automatically create a self-service organizer account in the current MVP."
            : "Rejection updates the request status. Confirm that the event should not proceed through CrownFi onboarding."}
        </p>
      </ConfirmModal>

      <Toast msg={toast.msg} tone={toast.tone} />
    </div>
  );
}

function Overview({ stats, loading }: { stats: any; loading: boolean }) {
  const cards = [
    { label: "Votes cast", value: stats?.votes ?? 0, Icon: Vote },
    { label: "Tickets minted", value: stats?.tickets ?? 0, Icon: Crown },
    { label: "Collectibles sold", value: stats?.collectiblesSold ?? 0, Icon: Sparkles },
    { label: "Contestants", value: stats?.contestants ?? 0, Icon: Users },
    { label: "Voting rounds", value: stats?.rounds ?? 0, Icon: ClipboardList },
    { label: "GMV (USDC)", value: stats?.gmv ?? 0, Icon: Trophy },
  ];
  const top = stats?.topContestants ?? [];
  const max = Math.max(1, ...top.map((contestant: any) => contestant.votes));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {cards.map(({ label, value, Icon }) => (
          <Card key={label} className={loading ? "animate-pulse" : ""}>
            <CardContent className="pt-5">
              <Icon className="text-gold-soft/35" size={18} />
              <div className="mt-3 font-display text-3xl font-semibold text-gold">{value.toLocaleString?.() ?? value}</div>
              <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-gold-soft/35">{label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Vote leaderboard</CardTitle>
          <CardDescription>Current cumulative vote totals returned by the administration statistics endpoint.</CardDescription>
        </CardHeader>
        <CardContent>
          {top.length === 0 ? (
            <EmptyState title="No votes have been recorded" description="The leaderboard will populate after participants vote in an open round." />
          ) : (
            <div className="space-y-4">
              {top.map((contestant: any, index: number) => (
                <div key={contestant.name} className="grid items-center gap-3 sm:grid-cols-[28px_180px_1fr_48px]">
                  <span className="text-sm font-semibold text-gold-soft/35">#{index + 1}</span>
                  <div className="truncate text-sm text-white">{flag(contestant.sash)} {contestant.name}</div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-white/5"><div className="h-full rounded-full bg-gradient-to-r from-gold-deep to-gold" style={{ width: `${(contestant.votes / max) * 100}%` }} /></div>
                  <div className="text-right text-sm font-semibold text-gold">{contestant.votes}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Rounds({ rounds, busy, onClose, onCreate }: { rounds: any[]; busy: string; onClose: (round: any) => void; onCreate: () => void }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="font-display text-2xl font-semibold text-white">Voting rounds</h2><p className="mt-1 text-sm text-gold-soft/45">Create rounds, monitor vote totals, and publish final checkpoints.</p></div>
        <Button onClick={onCreate}><Plus size={16} /> Create round</Button>
      </div>
      {rounds.length === 0 ? (
        <EmptyState title="No voting rounds" description="Create a round before contestants can receive votes." action={<Button onClick={onCreate}><Plus size={16} /> Create first round</Button>} />
      ) : (
        <div className="space-y-3">
          {rounds.map((round) => (
            <Card key={round.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-display text-xl font-semibold text-white">{round.title}</h3>
                    <Badge tone={round.status === "open" ? "success" : "neutral"}>{round.status === "open" ? "Voting open" : "Voting closed"}</Badge>
                    {round.checkpoint && <Badge tone="success">Checkpoint published</Badge>}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gold-soft/45">
                    <span>{round._count?.votes ?? 0} votes</span>
                    {round.checkpoint && <span className="mono text-emerald">Root {short(round.checkpoint.merkleRoot, 7)}</span>}
                  </div>
                </div>
                <Button variant={round.status === "closed" ? "secondary" : "danger"} disabled={round.status === "closed" || busy === round.id} onClick={() => onClose(round)}>
                  {busy === round.id ? "Publishing…" : round.status === "closed" ? "Voting closed" : "Close voting"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Contestants({ contestants, onCreate }: { contestants: any[]; onCreate: () => void }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="font-display text-2xl font-semibold text-white">Contestants</h2><p className="mt-1 text-sm text-gold-soft/45">Manage the candidate records used by voting and collectible features.</p></div>
        <Button onClick={onCreate}><Plus size={16} /> Add contestant</Button>
      </div>
      {contestants.length === 0 ? (
        <EmptyState title="No contestants" description="Add contestant records before opening voting." action={<Button onClick={onCreate}><Plus size={16} /> Add first contestant</Button>} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {contestants.map((contestant) => (
            <Card key={contestant.id}>
              <CardContent className="flex items-center gap-4 pt-5">
                <span className="grid h-12 w-12 place-items-center rounded-2xl border border-gold/20 bg-gold/10 text-2xl">{flag(contestant.sash)}</span>
                <div className="min-w-0">
                  <h3 className="truncate font-semibold text-white">{contestant.name}</h3>
                  <p className="mt-1 text-xs text-gold-soft/40">{contestant.country} · {contestant.sash}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Requests({ requests, onDecide }: { requests: any[]; onDecide: (request: any, status: "approved" | "rejected") => void }) {
  return (
    <div className="space-y-4">
      <div><h2 className="font-display text-2xl font-semibold text-white">Organizer applications</h2><p className="mt-1 text-sm text-gold-soft/45">Review pageants requesting CrownFi onboarding and record an approval decision.</p></div>
      {requests.length === 0 ? (
        <EmptyState title="No organizer applications" description="New submissions from the Organize page will appear here." />
      ) : (
        <div className="space-y-3">
          {requests.map((request) => (
            <Card key={request.id}>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2"><CardTitle>{request.pageantName}</CardTitle><Badge tone={request.status === "approved" ? "success" : request.status === "rejected" ? "danger" : "gold"}>{request.status}</Badge></div>
                    <CardDescription>{request.orgName} · {request.country}</CardDescription>
                  </div>
                  {request.status === "pending" && (
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => onDecide(request, "approved")}><CheckCircle2 size={15} /> Approve</Button>
                      <Button size="sm" variant="danger" onClick={() => onDecide(request, "rejected")}><CircleAlert size={15} /> Reject</Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <dl className="grid gap-3 rounded-2xl border border-line bg-black/20 p-4 text-sm sm:grid-cols-2">
                  <div><dt className="text-gold-soft/35">Contact</dt><dd className="mt-1 text-gold-soft">{request.contactName}</dd></div>
                  <div><dt className="text-gold-soft/35">Email</dt><dd className="mt-1 break-all text-gold-soft">{request.email}</dd></div>
                </dl>
                {request.message && <p className="mt-4 text-sm leading-6 text-gold-soft/50">{request.message}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
