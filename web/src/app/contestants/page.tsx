"use client";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/session/SessionProvider";
import { SpotlightCarousel, Slide } from "@/components/Carousel";
import { Portrait } from "@/components/Portrait";
import { Toast } from "@/components/ui";
import { short } from "@/lib/format";
import { getJson, postJson } from "@/lib/api";
import { signWithFreighter } from "@/wallet/freighter";

type Collectible = { id: string; title: string; priceUsdc: number; metadataUri: string; tokenId?: string; contestant: { id: string; name: string; country: string; sash: string } };

export default function CollectPage() {
  const { fan, address } = useSession();
  const [items, setItems] = useState<Collectible[]>([]);
  const [busy, setBusy] = useState("");
  const [balance, setBalance] = useState<number | null>(null);
  const [toast, setToast] = useState({ msg: "", tone: "ok" as "ok" | "err" });

  function load() { getJson<Collectible[]>("/api/collectibles", []).then(setItems); }
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

  const slides: Slide[] = items.map((c) => ({ id: c.contestant.id, name: c.contestant.name, country: c.contestant.country, sash: c.contestant.sash }));

  async function getTestUsdc() {
    if (!address) { flash("Connect your Freighter wallet first.", "err"); return; }
    setBusy("faucet");
    const r = await postJson<any>("/api/faucet", { walletAddress: address, amountUsdc: 50 });
    setBusy("");
    if (r.ok) { flash("+50 test USDC sent to your wallet.", "ok"); refreshBalance(); }
    else flash(`Faucet failed: ${(r.data as any)?.error ?? "error"}`, "err");
  }

  async function buy(c: Collectible) {
    if (!fan || !address) { flash("Connect your Freighter wallet first.", "err"); return; }
    setBusy(c.id);
    try {
      // Step 1 — ask the backend to build the purchase transaction.
      const prep = await postJson<any>("/api/collectibles/prepare-buy", { collectibleId: c.id, buyerAddress: address });
      if (!prep.ok) throw new Error((prep.data as any)?.error ?? "prepare_failed");

      if ((prep.data as any).mock) {
        // Mock mode: no chain — just mint.
        const r = await postJson<any>("/api/collectibles", { fanId: fan.id, collectibleId: c.id });
        if (!r.ok) throw new Error((r.data as any)?.error ?? "buy_failed");
        flash("Collected (mock). +10 points.", "ok");
        return;
      }

      // Step 2 — buyer approves the USDC payment in Freighter.
      const { xdr, priceUsdc } = prep.data as any;
      const signed = await signWithFreighter(xdr, address);
      if (signed.error || !signed.signedXdr) throw new Error(signed.error ?? "You cancelled the signature.");

      // Step 3 — submit + mint the NFT.
      const conf = await postJson<any>("/api/collectibles/confirm-buy", { collectibleId: c.id, fanId: fan.id, signedXdr: signed.signedXdr });
      if (!conf.ok) throw new Error((conf.data as any)?.error ?? "confirm_failed");

      flash(`Collected! ${priceUsdc} USDC split on-chain to the contestant. +10 points.`, "ok");
    } catch (e: any) {
      const m = String(e?.message ?? "");
      flash(m.includes("balance") || m.includes("trustline") ? "Not enough test USDC — click ‘Get test USDC’ first." : `Could not buy: ${m}`, "err");
    } finally {
      setBusy(""); load(); refreshBalance();
    }
  }

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow mb-2">Support the crown</div>
          <h1 className="font-display text-4xl font-semibold text-[#23252f]">Collectibles that fund contestants</h1>
          <p className="mt-2 text-sm text-[#5f6172]">Buy an official portrait in <b>USDC</b>. The payment is split on-chain — the contestant gets her cut instantly. <span className="tag-on ml-1">on-chain</span></p>
        </div>
        {address && (
          <div className="glass px-4 py-3 text-right">
            <div className="text-xs uppercase tracking-wider text-[#7a7768]">Your test USDC</div>
            <div className="font-display text-2xl font-semibold text-[#b8912f]">{balance == null ? "…" : balance.toFixed(2)}</div>
            <button className="btn-ghost mt-2 !px-3 !py-1.5 text-xs" disabled={busy === "faucet"} onClick={getTestUsdc}>
              {busy === "faucet" ? "Sending…" : "Get test USDC"}
            </button>
          </div>
        )}
      </div>

      <SpotlightCarousel slides={slides} cta="View" />

      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((c) => (
          <div key={c.id} className="glass overflow-hidden p-3">
            <Portrait id={c.contestant.id} name={c.contestant.name} sash={c.contestant.sash} />
            <div className="px-1 pt-3">
              <div className="font-display text-lg text-[#23252f]">{c.contestant.name}</div>
              <div className="text-xs text-[#7a7768]">{c.title}</div>
              <div className="mt-3 flex items-center justify-between">
                <span className="font-semibold text-[#b8912f]">{c.priceUsdc} USDC</span>
                <button className="btn-gold !px-4 !py-2" disabled={busy === c.id} onClick={() => buy(c)}>
                  {busy === c.id ? "Confirm in wallet…" : "Collect"}
                </button>
              </div>
              {c.tokenId && <div className="mono mt-2 text-[11px] text-emerald">NFT {short(c.tokenId, 6)}</div>}
            </div>
          </div>
        ))}
      </div>

      <Toast msg={toast.msg} tone={toast.tone} />
    </div>
  );
}
