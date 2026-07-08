"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "@/session/SessionProvider";
import { Toast } from "@/components/ui";
import { short } from "@/lib/format";
import { getJson, postJson } from "@/lib/api";
import { signWithFreighter } from "@/wallet/freighter";
import { TIER_LIST } from "@/lib/tiers";

type Ticket = { id: string; eventName: string; tier: string; seat: string; priceUsdc: number; tokenId?: string; status: string; fan: { handle: string } };

const TIERS = TIER_LIST.map((t) => ({ name: t.name, price: t.priceUsdc, perks: t.perks }));

export default function TicketsPage() {
  const { fan, address } = useSession();
  const router = useRouter();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [tier, setTier] = useState("Gold");
  const [busy, setBusy] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [toast, setToast] = useState({ msg: "", tone: "ok" as "ok" | "err" });
  const [lastTicketId, setLastTicketId] = useState<string | null>(null);

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
        const r = await postJson<any>("/api/tickets", { fanId: fan.id, eventName: "Coronation Night 2026", tier, priceUsdc: TIERS.find((x) => x.name === tier)!.price });
        if (!r.ok) throw new Error((r.data as any)?.error ?? "buy_failed");
        const newId = (r.data as any)?.ticket?.id;
        if (newId) setLastTicketId(newId);
        flash(`Ticket minted! Seat ${(r.data as any)?.ticket?.seat ?? ""}.`, "ok");
        return;
      }

      // Step 2 — buyer approves the USDC payment in Freighter.
      const signed = await signWithFreighter((prep.data as any).xdr, address);
      if (signed.error || !signed.signedXdr) throw new Error(signed.error ?? "You cancelled the signature.");

      // Step 3 — submit + mint the ticket NFT.
      const conf = await postJson<any>("/api/tickets/confirm-buy", { tier, fanId: fan.id, signedXdr: signed.signedXdr, intentId: (prep.data as any).intentId });
      if (!conf.ok) throw new Error((conf.data as any)?.error ?? "confirm_failed");

      const confId = (conf.data as any)?.ticket?.id;
      if (confId) setLastTicketId(confId);
      flash(`Paid ${(prep.data as any).priceUsdc} USDC on-chain — ${tier} ticket minted, seat ${(conf.data as any)?.ticket?.seat ?? ""}.`, "ok");
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

      <div className="grid gap-4 sm:grid-cols-3">
        {TIERS.map((t) => (
          <button key={t.name} onClick={() => setTier(t.name)}
            className={`glass p-5 text-left transition ${tier === t.name ? "shadow-spot ring-1 ring-gold" : "glass-hover"}`}>
            <div className="flex items-center justify-between">
              <span className="font-display text-xl text-[#23252f]">{t.name}</span>
              {tier === t.name && <span className="text-[#b8912f]">●</span>}
            </div>
            <div className="mt-1 text-2xl font-semibold text-[#b8912f]">{t.price} <span className="text-sm text-[#7a7768]">USDC</span></div>
            <div className="mt-2 text-xs text-[#6f6c5f]">{t.perks}</div>
          </button>
        ))}
      </div>

      <div className="mt-6">
        <button className="btn-gold" disabled={busy || !fan} onClick={buy}>{busy ? "Confirm in wallet…" : `Buy ${tier} ticket`}</button>
        {!fan && <span className="ml-3 text-sm text-[#7a7768]">Connect your Freighter wallet to buy.</span>}
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
                    <div className="text-center">
                      <div className="font-display text-lg font-bold">{t.tier}</div>
                      <div className="text-[10px] tracking-wider opacity-75">SEAT</div>
                      <div className="text-sm font-semibold">{t.seat}</div>
                    </div>
                  </div>
                  <div className="flex-1 p-4 flex flex-col justify-between">
                    <div>
                      <div className="font-medium text-[#23252f]">{t.eventName}</div>
                      <div className="text-xs text-[#7a7768]">{t.priceUsdc} USDC</div>
                      {t.tokenId && <div className="mono mt-2 text-[11px] text-emerald font-semibold">NFT {short(t.tokenId, 6)}</div>}
                    </div>
                    <div className="mt-4 flex items-center justify-between border-t border-[#e7e2d3] pt-3">
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${t.status === "redeemed" ? "bg-red-100 text-red-700" : "bg-emerald/10 text-emerald"}`}>
                        {t.status || "minted"}
                      </span>
                      <Link href={`/tickets/${t.id}`} className="btn-ghost !px-3 !py-1 text-xs font-semibold !rounded-full">
                        Claim Voucher
                      </Link>
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

      <Toast msg={toast.msg} tone={toast.tone} />
    </div>
  );
}
