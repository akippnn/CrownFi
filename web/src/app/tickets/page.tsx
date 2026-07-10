"use client";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "@/session/SessionProvider";
import { Toast } from "@/components/ui";
import { getJson, postJson } from "@/lib/api";
import { signWithFreighter } from "@/wallet/freighter";
import { TIER_LIST } from "@/lib/tiers";
import { TicketHero } from "@/components/tickets/TicketHero";
import { TicketTierSelector } from "@/components/tickets/TicketTierSelector";
import { TicketCheckoutPanel } from "@/components/tickets/TicketCheckoutPanel";
import { TicketSuccessBanner } from "@/components/tickets/TicketSuccessBanner";
import { TicketList } from "@/components/tickets/TicketList";
import { TicketDemoLinks } from "@/components/tickets/TicketDemoLinks";
import { SeatAssignmentModal } from "@/components/tickets/SeatAssignmentModal";
import type { Ticket } from "@/components/tickets/types";
import type { SeatSelection } from "@/components/SeatMap";

const TIERS = TIER_LIST.map((t) => ({ name: t.name, price: t.priceUsdc, perks: t.perks }));

function TicketsPageInner() {
  const { fan, address } = useSession();
  const searchParams = useSearchParams();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const paramTier = searchParams.get("tier");
  const [tier, setTier] = useState(paramTier && TIER_LIST.some((t) => t.name === paramTier) ? paramTier : "Gold");
  const [busy, setBusy] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [toast, setToast] = useState({ msg: "", tone: "ok" as "ok" | "err" });
  const [lastTicketId, setLastTicketId] = useState<string | null>(null);

  const [assigningTicket, setAssigningTicket] = useState<Ticket | null>(null);
  const [chosenSeat, setChosenSeat] = useState<SeatSelection | null>(null);
  const [savingSeat, setSavingSeat] = useState(false);

  function handleTierChange(newTier: string) {
    setTier(newTier);
    setChosenSeat(null);
  }

  function load() {
    getJson<Ticket[]>("/api/tickets", []).then(setTickets);
  }

  useEffect(load, []);

  const refreshBalance = useCallback(() => {
    if (address) {
      getJson<{ balanceUsdc: number }>(`/api/usdc-balance?address=${address}`, { balanceUsdc: 0 }).then((b) => setBalance(b.balanceUsdc));
    } else {
      setBalance(null);
    }
  }, [address]);

  useEffect(refreshBalance, [refreshBalance]);

  function flash(msg: string, tone: "ok" | "err") {
    setToast({ msg, tone });
    setTimeout(() => setToast({ msg: "", tone: "ok" }), 3200);
  }

  function closeSeatModal() {
    setAssigningTicket(null);
    setChosenSeat(null);
  }

  async function confirmSeat() {
    if (!assigningTicket || !chosenSeat) return;
    setSavingSeat(true);
    try {
      const r = await postJson<any>(`/api/tickets/${assigningTicket.id}/assign-seat`, { seat: chosenSeat.label, fanId: fan?.id });
      if (!r.ok) throw new Error((r.data as any)?.error ?? "assign_failed");
      flash(`Seat ${chosenSeat.label} assigned successfully!`, "ok");
      closeSeatModal();
      load();
    } catch (e: any) {
      flash(`Could not assign seat: ${e?.message ?? "error"}`, "err");
    } finally {
      setSavingSeat(false);
    }
  }

  async function getTestUsdc() {
    if (!address) {
      flash("Connect your Freighter wallet first.", "err");
      return;
    }
    setBusy(true);
    const r = await postJson<any>("/api/faucet", { walletAddress: address, amountUsdc: 200 });
    setBusy(false);
    if (r.ok) {
      flash("+200 test USDC sent to your wallet.", "ok");
      refreshBalance();
    } else {
      flash(`Faucet failed: ${(r.data as any)?.error ?? "error"}`, "err");
    }
  }

  async function buy() {
    if (!fan || !address) {
      flash("Connect your Freighter wallet first.", "err");
      return;
    }
    setBusy(true);
    try {
      const prep = await postJson<any>("/api/tickets/prepare-buy", { tier, buyerAddress: address, fanId: fan.id });
      if (!prep.ok) throw new Error((prep.data as any)?.error ?? "prepare_failed");

      if ((prep.data as any).mock) {
        const r = await postJson<any>("/api/tickets", {
          fanId: fan.id,
          eventName: "Coronation Night 2026",
          tier,
          priceUsdc: TIERS.find((x) => x.name === tier)!.price,
        });
        if (!r.ok) throw new Error((r.data as any)?.error ?? "buy_failed");
        const newTicket = (r.data as any)?.ticket;
        if (newTicket?.id) {
          setLastTicketId(newTicket.id);
          setAssigningTicket(newTicket);
        }
        flash("Ticket minted! Please choose your seat.", "ok");
        return;
      }

      const signed = await signWithFreighter((prep.data as any).xdr, address);
      if (signed.error || !signed.signedXdr) throw new Error(signed.error ?? "You cancelled the signature.");

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
      setBusy(false);
      load();
      refreshBalance();
    }
  }

  const mine = tickets.filter((t) => t.fan.handle === fan?.handle);

  return (
    <div>
      <TicketHero hasAddress={Boolean(address)} balance={balance} busy={busy} onGetTestUsdc={getTestUsdc} />
      <TicketTierSelector tiers={TIERS} selectedTier={tier} onSelectTier={handleTierChange} />
      <TicketCheckoutPanel busy={busy} fanConnected={Boolean(fan)} tier={tier} onBuy={buy} />
      <TicketSuccessBanner ticketId={lastTicketId} onDismiss={() => setLastTicketId(null)} />
      <TicketList tickets={mine} onChooseSeat={(ticket) => { setAssigningTicket(ticket); setChosenSeat(null); }} />
      <TicketDemoLinks />
      <SeatAssignmentModal
        ticket={assigningTicket}
        selectedSeat={chosenSeat}
        saving={savingSeat}
        onSelectSeat={setChosenSeat}
        onCancel={closeSeatModal}
        onConfirm={confirmSeat}
      />
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
