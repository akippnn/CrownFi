"use client";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "@/session/SessionProvider";
import { Toast } from "@/components/ui";
import { Badge, ConfirmModal, SelectField } from "@/components/ui-kit";
import { short } from "@/lib/format";
import { getJson, postJson } from "@/lib/api";
import { signWithFreighter } from "@/wallet/freighter";
import { testnetTransactionUrl } from "@/lib/stellarExplorer";
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
  const [balanceUsdc, setBalanceUsdc] = useState<number | null>(null);
  const [balanceXlm, setBalanceXlm] = useState<number | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"usdc" | "xlm">("usdc");
  const [toast, setToast] = useState({ msg: "", tone: "ok" as "ok" | "err" });
  const [lastTicketId, setLastTicketId] = useState<string | null>(null);
  const [lastTransaction, setLastTransaction] = useState<{ paymentTx: string; mintTx: string } | null>(null);
  const [reviewingPurchase, setReviewingPurchase] = useState(false);

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
      getJson<{ balanceUsdc: number; balanceXlm: number }>(`/api/usdc-balance?address=${address}`, { balanceUsdc: 0, balanceXlm: 0 }).then((b) => {
        setBalanceUsdc(b.balanceUsdc);
        setBalanceXlm(b.balanceXlm);
      });
    } else {
      setBalanceUsdc(null);
      setBalanceXlm(null);
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
      const prep = await postJson<any>("/api/tickets/prepare-buy", {
        tier,
        buyerAddress: address,
        fanId: fan.id,
        paymentMethod
      });
      if (!prep.ok) throw new Error((prep.data as any)?.error ?? "prepare_failed");

      const price = paymentMethod === "usdc" ? selectedTier.price : selectedTier.price * 10;
      const currentBalance = paymentMethod === "usdc" ? balanceUsdc : balanceXlm;

      if ((prep.data as any).mock) {
        if (address && currentBalance !== null && currentBalance < price) {
          throw new Error("balance_insufficient");
        }

        const r = await postJson<any>("/api/tickets", {
          fanId: fan.id,
          eventName: "Coronation Night 2026",
          tier,
          priceUsdc: selectedTier.price,
        });
        if (!r.ok) throw new Error((r.data as any)?.error ?? "buy_failed");
        const newTicket = (r.data as any)?.ticket;
        if (newTicket?.id) {
          setLastTicketId(newTicket.id);
          setAssigningTicket(newTicket);
        }
        flash("Ticket minted! Please choose your seat.", "ok");
        setReviewingPurchase(false);
        return;
      }

      // Check balance before wallet prompt
      if (address && currentBalance !== null && currentBalance < price) {
        throw new Error("balance_insufficient");
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
      setLastTransaction({ paymentTx: (conf.data as any).paymentTx, mintTx: (conf.data as any).mintTx });
      flash(`Paid ${paymentMethod === "usdc" ? (prep.data as any).priceUsdc + " USDC" : price + " XLM"} on-chain — ticket minted! Please choose your seat.`, "ok");
      setReviewingPurchase(false);
    } catch (e: any) {
      const m = String(e?.message ?? "");
      if (m === "balance_insufficient") {
        flash(paymentMethod === "usdc" ? "Not enough test USDC — click ‘Get test USDC’ first." : "Not enough XLM — fund your wallet first.", "err");
      } else {
        flash(m.includes("balance") || m.includes("trustline") ? "Not enough test USDC — click ‘Get test USDC’ first." : `Could not buy: ${m}`, "err");
      }
    } finally {
      setBusy(false);
      load();
      refreshBalance();
    }
  }

  const mine = tickets.filter((t) => t.fan.handle === fan?.handle);
  const selectedTier = TIERS.find((item) => item.name === tier)!;
  const currentPrice = paymentMethod === "usdc" ? selectedTier.price : selectedTier.price * 10;
  const currentBalance = paymentMethod === "usdc" ? balanceUsdc : balanceXlm;
  const isDemoMode = !process.env.STELLAR_MODE || process.env.STELLAR_MODE === "mock";

  return (
    <div>
      <TicketHero hasAddress={Boolean(address)} balanceUsdc={balanceUsdc} balanceXlm={balanceXlm} busy={busy} onGetTestUsdc={getTestUsdc} />
      {isDemoMode && (
        <div className="mb-6 rounded-2xl border border-gold/20 bg-gold/5 px-4 py-3 text-sm text-gold-soft/80">
          ✨ <strong className="text-gold">Demo/Mock Mode Active</strong>: Checkout is simulated, but your wallet balance will still be verified.
        </div>
      )}
      <TicketTierSelector tiers={TIERS} selectedTier={tier} onSelectTier={handleTierChange} />
      <TicketCheckoutPanel busy={busy} fanConnected={Boolean(fan)} tier={tier} price={currentPrice} currency={paymentMethod.toUpperCase()} onBuy={() => setReviewingPurchase(true)} />
      <TicketSuccessBanner ticketId={lastTicketId} onDismiss={() => setLastTicketId(null)} />
      {lastTransaction && (
        <div className="mb-6 rounded-2xl border border-emerald/30 bg-emerald/10 p-4 text-sm text-gold-soft">
          <div className="font-semibold text-white">Confirmed on Stellar Testnet</div>
          <p className="mt-1 text-gold-soft/65">Your payment and CrownFi ticket mint are separate on-chain transactions.</p>
          <div className="mt-3 flex flex-wrap gap-3">
            {testnetTransactionUrl(lastTransaction.paymentTx) && <a className="font-semibold text-gold underline underline-offset-2" href={testnetTransactionUrl(lastTransaction.paymentTx)!} target="_blank" rel="noopener noreferrer">View payment</a>}
            {testnetTransactionUrl(lastTransaction.mintTx) && <a className="font-semibold text-gold underline underline-offset-2" href={testnetTransactionUrl(lastTransaction.mintTx)!} target="_blank" rel="noopener noreferrer">View ticket mint</a>}
          </div>
        </div>
      )}
      <TicketList tickets={mine} onChooseSeat={(ticket) => { setAssigningTicket(ticket); setChosenSeat(null); }} />
      <TicketDemoLinks />
      <ConfirmModal
        open={reviewingPurchase}
        onClose={() => setReviewingPurchase(false)}
        onConfirm={buy}
        title={`Buy a ${tier} ticket`}
        description="Review the event pass before Freighter opens for payment."
        confirmLabel={`Pay ${currentPrice} ${paymentMethod.toUpperCase()}`}
        pendingLabel="Confirm in wallet…"
        pending={busy}
      >
        <div className="space-y-4">
          <div className="rounded-2xl border border-gold/25 bg-gold/10 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <Badge tone="gold">{tier} tier</Badge>
                <h3 className="mt-3 font-display text-2xl font-semibold text-white">Coronation Night 2026</h3>
                <p className="mt-1 text-sm text-gold-soft/50">{selectedTier.perks}</p>
              </div>
              <div className="text-right">
                <div className="text-[11px] uppercase tracking-[0.16em] text-gold-soft/40">Total</div>
                <div className="mt-1 font-display text-3xl font-semibold text-gold">{currentPrice} {paymentMethod.toUpperCase()}</div>
              </div>
            </div>
          </div>
          
          <div className="rounded-2xl border border-line bg-black/10 p-4 space-y-2">
            <SelectField
              id="payment-method"
              label="Select Payment Method"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as "usdc" | "xlm")}
            >
              <option value="usdc">USDC Token (Soroban SPLIT)</option>
              <option value="xlm">XLM Native (Direct Multi-Payment)</option>
            </SelectField>
          </div>

          <dl className="space-y-2 rounded-2xl border border-line bg-black/25 p-4 text-sm">
            <div className="flex justify-between gap-4"><dt className="text-gold-soft/45">Wallet</dt><dd className="mono text-xs text-gold-soft">{address ? short(address, 8) : "Not connected"}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-gold-soft/45">Seat</dt><dd className="text-gold-soft">Selected after purchase</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-gold-soft/45">Network</dt><dd className="text-gold-soft">Stellar testnet or local demo</dd></div>
          </dl>
          {currentBalance != null && currentBalance < currentPrice && (
            <p className="rounded-2xl border border-ruby/30 bg-ruby/10 px-4 py-3 text-sm text-ruby">
              Your test {paymentMethod.toUpperCase()} balance may be too low for this tier.
            </p>
          )}
        </div>
      </ConfirmModal>

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
