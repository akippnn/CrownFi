"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Icons } from "@/components/icons";
import { getJson, postJson } from "@/lib/api";

type Ticket = {
  id: string;
  eventName: string;
  tier: string;
  seat: string;
  priceUsdc: number;
  tokenId?: string;
  mintTx?: string;
  status: string;
  createdAt: string;
  fan: {
    handle: string;
    walletAddress?: string;
  };
};

const TIER_COLORS: Record<string, { gradient: string; accent: string; ring: string }> = {
  Silver:  { gradient: "from-[#b8c6db] to-[#8e9aad]", accent: "#8e9aad", ring: "ring-[#b8c6db]" },
  Gold:    { gradient: "from-[#d4af37] to-[#b8912f]", accent: "#b8912f", ring: "ring-[#d4af37]" },
  Diamond: { gradient: "from-[#7b68ee] to-[#5b4fc7]", accent: "#5b4fc7", ring: "ring-[#7b68ee]" },
};

export default function TicketVerificationPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updating, setUpdating] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  const loadTicket = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await getJson<{ ok: boolean; ticket?: Ticket; error?: string }>(`/api/tickets/${id}`, { ok: false, error: "Failed to load ticket" });
      if (res.ticket) setTicket(res.ticket);
      else setError(res.error || "Ticket not found");
    } catch {
      setError("Failed to fetch ticket verification data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadTicket(); }, [id]);

  const handleRedeem = async () => {
    if (!id || updating) return;
    setUpdating(true);
    setSuccessMsg("");
    try {
      const res = await postJson<{ ok: boolean; ticket?: Ticket; error?: string }>(`/api/tickets/${id}`, {});
      const data = res.data as { ok?: boolean; ticket?: Ticket; error?: string };
      if (res.ok && data.ticket) {
        setTicket(data.ticket);
        setSuccessMsg("Ticket redeemed successfully. Entry granted.");
      } else {
        setError(data.error || "Redemption failed");
      }
    } catch {
      setError("An error occurred during redemption.");
    } finally {
      setUpdating(false);
    }
  };

  /* ── loading ─────────────────────────────── */
  if (loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
        <div className="relative">
          <div className="h-14 w-14 animate-spin rounded-full border-[3px] border-[#eee6d3] border-t-[#d4af37]"></div>
          <div className="absolute inset-0 grid place-items-center">
            <Icons.Verify size={18} className="text-[#b8912f]" />
          </div>
        </div>
        <p className="text-sm text-[#7a7768] mt-2">Verifying ticket authenticity…</p>
      </div>
    );
  }

  /* ── error / not found ───────────────────── */
  if (error || !ticket) {
    return (
      <div className="mx-auto max-w-md text-center py-16">
        <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-red-50 text-red-500 shadow-[0_8px_30px_-8px_rgba(220,60,60,0.2)]">
          <Icons.X size={28} strokeWidth={2.5} />
        </div>
        <h2 className="font-display text-2xl font-bold text-[#23252f]">Verification Failed</h2>
        <p className="mt-2 text-sm text-[#7a7768] max-w-xs mx-auto">{error || "This ticket is invalid or does not exist in our system."}</p>
        <button onClick={() => router.push("/tickets")} className="btn-ghost mt-6">Back to Dashboard</button>
      </div>
    );
  }

  const isRedeemed = ticket.status === "redeemed";
  const tierStyle = TIER_COLORS[ticket.tier] ?? TIER_COLORS.Gold;
  const dateIssued = new Date(ticket.createdAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const timeIssued = new Date(ticket.createdAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  const walletShort = ticket.fan.walletAddress
    ? `${ticket.fan.walletAddress.slice(0, 6)}…${ticket.fan.walletAddress.slice(-6)}`
    : "—";

  return (
    <div className="mx-auto max-w-lg pb-12">

      {/* Header */}
      <div className="mb-8 text-center">
        <div className="eyebrow mb-2">Ticket Scanner</div>
        <h1 className="font-display text-3xl font-semibold text-[#23252f]">Verify & Redeem</h1>
        <p className="mt-2 text-sm text-[#5f6172]">Authenticate ticket status via the Stellar blockchain.</p>
      </div>

      {/* Success toast */}
      {successMsg && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-emerald-500 text-white mt-0.5">
            <Icons.Check size={14} strokeWidth={3} />
          </div>
          <div>
            <div className="text-sm font-bold text-emerald-800">Entry Granted</div>
            <div className="text-xs text-emerald-700 mt-0.5">{successMsg}</div>
          </div>
        </div>
      )}

      {/* Main card */}
      <div className="rounded-2xl border border-[#e7e2d3] bg-white shadow-[0_24px_80px_-16px_rgba(120,100,40,0.18)] overflow-hidden">

        {/* Status header */}
        <div className={`relative overflow-hidden ${isRedeemed ? "bg-gradient-to-br from-red-500 to-red-700" : `bg-gradient-to-br ${tierStyle.gradient}`}`}>
          {/* Decorative pattern */}
          <div className="absolute inset-0 opacity-[0.07]" style={{
            backgroundImage: `radial-gradient(circle at 2px 2px, white 1px, transparent 0)`,
            backgroundSize: "24px 24px",
          }}></div>

          <div className="relative px-6 py-8 text-center text-white">
            {/* Status icon */}
            <div className={`mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-white/20 backdrop-blur-sm shadow-lg ring-2 ring-white/30`}>
              {isRedeemed ? (
                <Icons.X size={30} strokeWidth={2.5} />
              ) : (
                <Icons.Check size={30} strokeWidth={2.5} />
              )}
            </div>

            <h2 className="font-display text-2xl font-bold tracking-tight">
              {isRedeemed ? "Already Redeemed" : "Valid Ticket"}
            </h2>
            <p className="mt-1.5 text-sm text-white/80 max-w-xs mx-auto">
              {isRedeemed
                ? "This voucher has already been scanned and used for entry."
                : "This ticket voucher is authentic and ready for check-in."}
            </p>

            {/* Tier + Seat pills */}
            <div className="flex items-center justify-center gap-2 mt-4">
              <span className="inline-flex items-center gap-1 rounded-full bg-white/20 backdrop-blur-sm px-3 py-1 text-[11px] font-bold uppercase tracking-wider">
                <Icons.Tickets size={12} /> {ticket.tier}
              </span>
              <span className="inline-flex items-center rounded-full bg-white/20 backdrop-blur-sm px-3 py-1 text-[11px] font-bold uppercase tracking-wider">
                Seat {ticket.seat}
              </span>
            </div>
          </div>
        </div>

        {/* Event info strip */}
        <div className="border-b border-[#eee6d3] bg-[#faf7ef] px-6 py-4">
          <div className="text-[9px] text-[#9a968b] uppercase font-bold tracking-[0.2em]">Event</div>
          <div className="font-display text-lg font-bold text-[#23252f] mt-0.5">{ticket.eventName}</div>
          <div className="text-xs text-[#7a7768] mt-0.5">{dateIssued} · {timeIssued}</div>
        </div>

        {/* Details grid */}
        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl bg-[#faf7ef] border border-[#eee6d3] px-4 py-3">
              <div className="text-[9px] text-[#9a968b] uppercase font-bold tracking-wider">Buyer</div>
              <div className="text-sm font-semibold text-[#23252f] mt-0.5">@{ticket.fan.handle}</div>
            </div>
            <div className="rounded-xl bg-[#faf7ef] border border-[#eee6d3] px-4 py-3">
              <div className="text-[9px] text-[#9a968b] uppercase font-bold tracking-wider">Amount Paid</div>
              <div className="text-sm font-semibold text-[#23252f] mt-0.5">{ticket.priceUsdc} <span className="text-[10px] text-[#9a968b]">USDC</span></div>
            </div>
          </div>

          {/* Wallet */}
          <div className="rounded-xl bg-[#faf7ef] border border-[#eee6d3] px-4 py-3">
            <div className="text-[9px] text-[#9a968b] uppercase font-bold tracking-wider">Stellar Wallet</div>
            <div className="mono text-xs text-[#3a3f52] mt-0.5">{walletShort}</div>
          </div>

          {/* Voucher ID */}
          <div className="rounded-xl bg-[#faf7ef] border border-[#eee6d3] px-4 py-3">
            <div className="text-[9px] text-[#9a968b] uppercase font-bold tracking-wider">Voucher ID</div>
            <div className="mono text-[11px] text-[#3a3f52] mt-0.5 select-all break-all">{ticket.id}</div>
          </div>

          {/* On-chain data */}
          {(ticket.tokenId || ticket.mintTx) && (
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 px-4 py-3 space-y-2">
              <div className="text-[9px] text-emerald-600 uppercase font-bold tracking-wider flex items-center gap-1">
                <Icons.Check size={10} strokeWidth={3} /> On-Chain Proof
              </div>
              {ticket.tokenId && (
                <div>
                  <div className="text-[8px] text-emerald-500/70 uppercase font-bold tracking-wider">NFT Token ID</div>
                  <div className="mono text-[10px] text-emerald-800 mt-0.5 break-all select-all">{ticket.tokenId}</div>
                </div>
              )}
              {ticket.mintTx && (
                <div>
                  <div className="text-[8px] text-emerald-500/70 uppercase font-bold tracking-wider">Mint Tx</div>
                  <div className="mono text-[10px] text-emerald-800 mt-0.5 break-all select-all">{ticket.mintTx}</div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Action footer */}
        <div className="border-t border-[#eee6d3] bg-[#faf7ef]/60 px-6 py-5">
          {!isRedeemed ? (
            <div className="space-y-3 text-center">
              <p className="text-[11px] text-[#7a7768] max-w-xs mx-auto">
                Confirm ticket redemption below. This action is <strong>irreversible</strong> — the ticket will be marked as used.
              </p>
              <button
                onClick={handleRedeem}
                disabled={updating}
                className="w-full btn-gold !py-3.5 !text-sm !font-bold"
              >
                {updating ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[#1a1f35] border-t-transparent"></span>
                    Processing…
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <Icons.Check size={16} strokeWidth={2.5} /> Confirm & Redeem Ticket
                  </span>
                )}
              </button>
            </div>
          ) : (
            <div className="text-center py-2 space-y-2">
              <div className="inline-flex items-center gap-1.5 text-xs text-red-600 bg-red-50 border border-red-100 rounded-full px-4 py-1.5 font-bold uppercase tracking-wider">
                <Icons.Lock size={12} /> Redeemed & Locked
              </div>
              <p className="text-[11px] text-[#7a7768]">
                This ticket has been used for entry. No further redemption is possible.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Footer link */}
      <div className="mt-8 text-center">
        <Link href="/tickets" className="inline-flex items-center gap-1.5 text-sm text-[#7a7768] hover:text-[#23252f] transition underline underline-offset-2">
          <Icons.Prev size={12} /> Back to Tickets Dashboard
        </Link>
      </div>
    </div>
  );
}
