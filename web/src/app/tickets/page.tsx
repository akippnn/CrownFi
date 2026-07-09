"use client";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useSession } from "@/session/SessionProvider";
import { Toast } from "@/components/ui";
import { short } from "@/lib/format";
import { getJson, postJson } from "@/lib/api";
import { signWithFreighter } from "@/wallet/freighter";
import { TIER_LIST } from "@/lib/tiers";
import { SeatMap, type SeatSelection } from "@/components/SeatMap";

type Ticket = { id: string; eventName: string; tier: string; seat: string; priceUsdc: number; tokenId?: string; status: string; fan: { handle: string } };

const TIERS = TIER_LIST.map((t) => ({ name: t.name, price: t.priceUsdc, perks: t.perks }));

function convertToSeatId(seatStr: string, tier: string): string | undefined {
  if (!seatStr || seatStr === "Unassigned") return undefined;
  const m = seatStr.match(/Row\s+(\d+)\s+Seat\s+(\d+)/i);
  if (!m) return undefined;
  return `${tier[0]}-${m[1]}-${m[2]}`;
}

function TicketsPageInner() {
  const { fan, address } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const paramTier = searchParams.get("tier");
  const [tier, setTier] = useState(paramTier && TIER_LIST.some((t) => t.name === paramTier) ? paramTier : "Gold");
  const [busy, setBusy] = useState(false);
  const [selectedSeat, setSelectedSeat] = useState<SeatSelection | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [toast, setToast] = useState({ msg: "", tone: "ok" as "ok" | "err" });
  const [lastTicketId, setLastTicketId] = useState<string | null>(null);

  // Seat assignment states
  const [assigningTicket, setAssigningTicket] = useState<Ticket | null>(null);
  const [chosenSeat, setChosenSeat] = useState<SeatSelection | null>(null);
  const [savingSeat, setSavingSeat] = useState(false);

  // Reset selected seat when tier changes
  const handleTierChange = (newTier: string) => {
    setTier(newTier);
    setSelectedSeat(null);
  };

  async function confirmSeat() {
    if (!assigningTicket || !chosenSeat) return;
    setSavingSeat(true);
    try {
      const r = await postJson<any>(`/api/tickets/${assigningTicket.id}/assign-seat`, { seat: chosenSeat.label });
      if (!r.ok) throw new Error((r.data as any)?.error ?? "assign_failed");
      flash(`Seat ${chosenSeat.label} assigned successfully!`, "ok");
      setAssigningTicket(null);
      setChosenSeat(null);
      load();
    } catch (e: any) {
      flash(`Could not assign seat: ${e?.message ?? "error"}`, "err");
    } finally {
      setSavingSeat(false);
    }
  }

  function load() { getJson<Ticket[]>("/api/tickets", []).then(setTickets); }
  useEffect(load, []);

  const refreshBalance = useCallback(() => {
    if (address) getJson<{ balanceUsdc: number }>(`/api/usdc-balance?address=${address}`, { balanceUsdc: 0 }).then((b) => setBalance(b.balanceUsdc));
    else setBalance(null);
  }, [address]);
  useEffect(refreshBalance, [refreshBalance]);

  function flash(msg: string, tone: "ok" | "err") {
    setToast({ msg, tone });
    setTimeout(() => setToast({ msg: "", tone: "ok" }), 3200);
  }

  async function getTestUsdc() {
    if (!address) { flash("Connect your Freighter wallet first.", "err"); return; }
    setBusy(true);
    const r = await postJson<any>("/api/faucet", { walletAddress: address, amountUsdc: 200 });
    setBusy(false);
    if (r.ok) { flash("+200 test USDC sent to your wallet.", "ok"); refreshBalance(); }
    else flash(`Faucet failed: ${(r.data as any)?.error ?? "error"}`, "err");
  }

  async function buy() {
    if (!fan || !address) { flash("Connect your Freighter wallet first.", "err"); return; }
    setBusy(true);
    try {
      // Step 1 — build the purchase tx.
      const prep = await postJson<any>("/api/tickets/prepare-buy", { tier, buyerAddress: address, fanId: fan.id });
      if (!prep.ok) throw new Error((prep.data as any)?.error ?? "prepare_failed");

      if ((prep.data as any).mock) {
        const r = await postJson<any>("/api/tickets", {
          fanId: fan.id,
          eventName: "Coronation Night 2026",
          tier,
          priceUsdc: TIERS.find((x) => x.name === tier)!.price
        });
        if (!r.ok) throw new Error((r.data as any)?.error ?? "buy_failed");
        const newTicket = (r.data as any)?.ticket;
        if (newTicket?.id) {
          setLastTicketId(newTicket.id);
          setAssigningTicket(newTicket);
        }
        flash(`Ticket minted! Please choose your seat.`, "ok");
        return;
      }

      // Step 2 — buyer approves the USDC payment in Freighter.
      const signed = await signWithFreighter((prep.data as any).xdr, address);
      if (signed.error || !signed.signedXdr) throw new Error(signed.error ?? "You cancelled the signature.");

      // Step 3 — submit + mint the ticket NFT.
      const conf = await postJson<any>("/api/tickets/confirm-buy", {
        tier,
        fanId: fan.id,
        signedXdr: signed.signedXdr,
        intentId: (prep.data as any).intentId,
      });
      if (!conf.ok) throw new Error((conf.data as any)?.error ?? "confirm_failed");

      const newTicket = (conf.data as any)?.ticket;
      if (newTicket?.id) {
        setLastTicketId(newTicket.id);
        setAssigningTicket(newTicket);
      }
      flash(`Paid ${(prep.data as any).priceUsdc} USDC on-chain — ticket minted! Please choose your seat.`, "ok");
    } catch (e: any) {
      const m = String(e?.message ?? "");
      flash(m.includes("balance") || m.includes("trustline") ? "Not enough test USDC — click ‘Get test USDC’ first." : `Could not buy: ${m}`, "err");
    } finally {
      setBusy(false); load(); refreshBalance();
    }
  }

  const mine = tickets.filter((t) => t.fan.handle === fan?.handle);

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow mb-2">Coronation Night 2026</div>
          <h1 className="font-display text-4xl font-semibold text-[#23252f]">Fair tickets, on-chain</h1>
          <p className="mt-2 text-sm text-[#5f6172]">Pay in <b>USDC</b>, and each ticket is an NFT with a tier and seat. Resale is capped by the contract, so scalpers lose. <span className="tag-on ml-1">on-chain</span></p>
        </div>
        {address && (
          <div className="glass px-4 py-3 text-right">
            <div className="text-xs uppercase tracking-wider text-[#7a7768]">Your test USDC</div>
            <div className="font-display text-2xl font-semibold text-[#b8912f]">{balance == null ? "…" : balance.toFixed(2)}</div>
            <button className="btn-ghost mt-2 !px-3 !py-1.5 text-xs" disabled={busy} onClick={getTestUsdc}>Get test USDC</button>
          </div>
        )}
      </div>

      <div className="mb-4">
        <h2 className="font-display text-xl font-semibold text-[#23252f] mb-3">1. Select Ticket Tier</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {TIERS.map((t) => (
            <button key={t.name} onClick={() => handleTierChange(t.name)}
              className={`glass p-5 text-left transition ${tier === t.name ? "shadow-spot ring-1 ring-gold bg-[#faf7ef]" : "glass-hover"}`}>
              <div className="flex items-center justify-between">
                <span className="font-display text-xl text-[#23252f]">{t.name}</span>
                {tier === t.name && <span className="text-[#b8912f]">●</span>}
              </div>
              <div className="mt-1 text-2xl font-semibold text-[#b8912f]">{t.price} <span className="text-sm text-[#7a7768]">USDC</span></div>
              <div className="mt-2 text-xs text-[#6f6c5f]">{t.perks}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-8 border-t border-[#e7e2d3] pt-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="font-display text-lg font-semibold text-[#23252f]">2. Complete Booking</h3>
          <p className="text-xs text-[#7a7768] mt-0.5">Please make sure your Freighter wallet is connected.</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            className="btn-gold" 
            disabled={busy || !fan} 
            onClick={buy}
          >
            {busy ? "Confirm in wallet…" : `Buy ${tier} Ticket`}
          </button>
          {!fan && <span className="text-sm text-[#7a7768]">Connect your Freighter wallet to buy.</span>}
        </div>
      </div>

      {lastTicketId && (
        <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 flex items-start gap-3">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-500 text-white mt-0.5">
            <span className="text-sm font-bold">✓</span>
          </div>
          <div className="flex-1">
            <div className="text-sm font-bold text-emerald-800">Ticket purchased successfully!</div>
            <p className="text-xs text-emerald-700 mt-0.5">Your claim voucher is ready. Print it or save it as PDF to present at the venue.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href={`/tickets/${lastTicketId}`} className="btn-gold !py-1.5 !px-4 !text-xs">
                View Claim Voucher
              </Link>
              <Link href={`/tickets/verify/${lastTicketId}`} className="btn-ghost !py-1.5 !px-4 !text-xs">
                Test QR Verification
              </Link>
              <button onClick={() => setLastTicketId(null)} className="text-xs text-emerald-600 underline underline-offset-2 hover:text-emerald-800">
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {mine.length > 0 && (
        <div className="mt-10">
          <h2 className="mb-3 font-display text-2xl text-[#23252f]">Your tickets</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {mine.map((t) => (
              <div key={t.id} className="glass overflow-hidden flex flex-col justify-between">
                <div className="flex items-stretch h-full">
                  <div className="grid w-24 shrink-0 place-items-center bg-gradient-to-b from-[#d4af37] to-[#b8912f] text-[#1a1f35]">
                    <div className="text-center px-1">
                      <div className="font-display text-lg font-bold">{t.tier}</div>
                      <div className="text-[10px] tracking-wider opacity-75">SEAT</div>
                      <div className="text-xs font-semibold uppercase truncate">
                        {t.seat === "Unassigned" ? "TBD" : t.seat.replace("Row ", "R").replace(" Seat ", "S")}
                      </div>
                    </div>
                  </div>
                  <div className="flex-1 p-4 flex flex-col justify-between">
                    <div>
                      <div className="font-medium text-[#23252f]">{t.eventName}</div>
                      <div className="text-xs text-[#7a7768]">{t.priceUsdc} USDC</div>
                      <div className="mt-2 text-xs font-semibold">
                        {t.seat === "Unassigned" ? (
                          <span className="text-amber-600">⚠️ Seat: Not selected yet</span>
                        ) : (
                          <span className="text-emerald-700">📍 Seat: {t.seat}</span>
                        )}
                      </div>
                      {t.tokenId && <div className="mono mt-2 text-[11px] text-emerald font-semibold">NFT {short(t.tokenId, 6)}</div>}
                    </div>
                    <div className="mt-4 flex flex-wrap items-center justify-between border-t border-[#e7e2d3] pt-3 gap-2">
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${t.status === "redeemed" ? "bg-red-100 text-red-700" : "bg-emerald/10 text-emerald"}`}>
                        {t.status || "minted"}
                      </span>
                      <div className="flex items-center gap-2">
                        {t.seat === "Unassigned" ? (
                          <button
                            onClick={() => setAssigningTicket(t)}
                            className="btn-gold !px-3 !py-1 text-xs font-semibold"
                          >
                            🗺️ Choose Seat
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={() => setAssigningTicket(t)}
                              className="text-xs text-[#b8912f] underline hover:text-[#a97f16] font-semibold"
                            >
                              Change Seat
                            </button>
                            <Link href={`/tickets/${t.id}`} className="btn-ghost !px-3 !py-1 text-xs font-semibold !rounded-full">
                              Claim Voucher
                            </Link>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-8 border-t border-[#e7e2d3] pt-6">
        <h3 className="text-sm font-semibold text-[#23252f]">Testing & Demo:</h3>
        <p className="text-xs text-[#7a7768] mt-1 leading-relaxed">
          Want to preview the ticket voucher print layout and verification scanner flow? Check out the{" "}
          <Link href="/tickets/demo-ticket-12345" className="text-[#b8912f] font-semibold underline hover:text-[#a97f16]">
            Demo Claim Voucher Layout
          </Link>{" "}
          or the{" "}
          <Link href="/tickets/verify/demo-ticket-12345" className="text-[#b8912f] font-semibold underline hover:text-[#a97f16]">
            Redemption Verification Page
          </Link> (where you can scan and mark it as redeemed).
        </p>
      </div>

      {/* ─── POST-PURCHASE SEAT ASSIGNMENT MODAL ─── */}
      {assigningTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-[#1a1f35]/70 backdrop-blur-sm transition-opacity"
            onClick={() => { if (!savingSeat) setAssigningTicket(null); }}
          />

          {/* Modal Container */}
          <div className="relative w-full max-w-4xl glass bg-white p-6 shadow-2xl z-10 max-h-[90vh] overflow-y-auto flex flex-col justify-between rounded-3xl border border-[#eee6d3]">
            {/* Header */}
            <div className="mb-4 flex items-start justify-between border-b border-[#eee6d3] pb-3">
              <div>
                <h3 className="font-display text-2xl font-semibold text-[#23252f]">
                  Assign Seat: {assigningTicket.tier} Tier
                </h3>
                <p className="mt-1 text-xs text-[#7a7768]">
                  Select any available seat inside your highlighted **{assigningTicket.tier}** zone.
                </p>
              </div>
              <button
                onClick={() => setAssigningTicket(null)}
                disabled={savingSeat}
                className="rounded-full p-1.5 text-[#7a7768] hover:bg-[#faf7ef] hover:text-[#23252f] transition"
              >
                ✕
              </button>
            </div>

            {/* Seatmap */}
            <div className="my-2 border border-[#e7e2d3] rounded-2xl overflow-hidden bg-[#1a1f35]">
              <SeatMap
                tierFilter={assigningTicket.tier as any}
                initialSelectedSeatId={convertToSeatId(assigningTicket.seat, assigningTicket.tier)}
                onSelect={(sel) => setChosenSeat(sel)}
              />
            </div>

            {/* Footer */}
            <div className="mt-4 flex items-center justify-between border-t border-[#eee6d3] pt-3">
              <div className="text-sm">
                {chosenSeat ? (
                  <span className="text-emerald-700 font-semibold">📍 Selected: Row {chosenSeat.row} · Seat {chosenSeat.col}</span>
                ) : (
                  <span className="text-[#7a7768]">Please tap a seat to select.</span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setAssigningTicket(null)}
                  disabled={savingSeat}
                  className="btn-ghost !px-4 !py-2 text-xs"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmSeat}
                  disabled={savingSeat || !chosenSeat}
                  className="btn-gold !px-5 !py-2 text-xs"
                >
                  {savingSeat ? "Assigning Seat…" : "Confirm Seat Choice"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <Toast msg={toast.msg} tone={toast.tone} />
    </div>
  );
}

export default function TicketsPage() {
  return (
    <Suspense fallback={<div className="text-center py-12 text-[#7a7768]">Loading tickets…</div>}>
      <TicketsPageInner />
    </Suspense>
  );
}
