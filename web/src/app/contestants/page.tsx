"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Gem, WalletCards } from "lucide-react";
import { useSession } from "@/session/SessionProvider";
import { Portrait } from "@/components/Portrait";
import { Toast } from "@/components/ui";
import { short } from "@/lib/format";
import { getJson, postJson } from "@/lib/api";
import { signWithFreighter } from "@/wallet/freighter";
import { testnetTransactionUrl } from "@/lib/stellarExplorer";
import {
  Badge,
  Button,
  Card,
  CardContent,
  ConfirmModal,
  EmptyState,
  SectionHeader,
  SelectField,
} from "@/components/ui-kit";

type Collectible = {
  id: string;
  title: string;
  priceUsdc: number;
  metadataUri: string;
  tokenId?: string;
  contestant: { id: string; name: string; country: string; sash: string };
};

function CollectPageInner() {
  const { fan, address } = useSession();
  const searchParams = useSearchParams();
  const candidateParam = searchParams.get("candidate");
  const [items, setItems] = useState<Collectible[]>([]);
  const [selected, setSelected] = useState<Collectible | null>(null);
  const [busy, setBusy] = useState("");
  const [balanceUsdc, setBalanceUsdc] = useState<number | null>(null);
  const [balanceXlm, setBalanceXlm] = useState<number | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"usdc" | "xlm">("usdc");
  const [toast, setToast] = useState({ msg: "", tone: "ok" as "ok" | "err" });
  const [lastTransaction, setLastTransaction] = useState<{ paymentTx: string; mintTx: string } | null>(null);

  const load = useCallback(() => {
    getJson<Collectible[]>("/api/collectibles", []).then((fetchedItems) => {
      setItems(fetchedItems);
      if (candidateParam) {
        const match = fetchedItems.find((item) => item.contestant.id === candidateParam);
        if (match) setSelected(match);
      }
    });
  }, [candidateParam]);

  useEffect(() => {
    load();
  }, [load]);

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

  async function getTestUsdc() {
    if (!address) {
      flash("Connect your Freighter wallet first.", "err");
      return;
    }
    setBusy("faucet");
    const response = await postJson<any>("/api/faucet", { walletAddress: address, amountUsdc: 50 });
    setBusy("");
    if (response.ok) {
      flash("+50 test USDC sent to your wallet.", "ok");
      refreshBalance();
    } else flash(`Faucet failed: ${(response.data as any)?.error ?? "error"}`, "err");
  }

  async function buy() {
    const collectible = selected;
    if (!collectible) return;
    if (!fan || !address) {
      flash("Connect your Freighter wallet first.", "err");
      return;
    }
    setBusy(collectible.id);
    try {
      const prep = await postJson<any>("/api/collectibles/prepare-buy", {
        collectibleId: collectible.id,
        buyerAddress: address,
        fanId: fan.id,
        paymentMethod
      });
      if (!prep.ok) throw new Error((prep.data as any)?.error ?? "prepare_failed");

      const price = paymentMethod === "usdc" ? collectible.priceUsdc : collectible.priceUsdc * 10;
      const currentBalance = paymentMethod === "usdc" ? balanceUsdc : balanceXlm;

      if ((prep.data as any).mock) {
        if (address && currentBalance !== null && currentBalance < price) {
          throw new Error("balance_insufficient");
        }

        const response = await postJson<any>("/api/collectibles", { fanId: fan.id, collectibleId: collectible.id });
        if (!response.ok) throw new Error((response.data as any)?.error ?? "buy_failed");
        flash("Collectible minted in local demo mode. +10 points.", "ok");
        setSelected(null);
        return;
      }

      if (address && currentBalance !== null && currentBalance < price) {
        throw new Error("balance_insufficient");
      }

      const { xdr } = prep.data as any;
      const signed = await signWithFreighter(xdr, address);
      if (signed.error || !signed.signedXdr) throw new Error(signed.error ?? "You cancelled the signature.");

      const confirmed = await postJson<any>("/api/collectibles/confirm-buy", {
        collectibleId: collectible.id,
        fanId: fan.id,
        signedXdr: signed.signedXdr,
        intentId: (prep.data as any).intentId,
      });
      if (!confirmed.ok) throw new Error((confirmed.data as any)?.error ?? "confirm_failed");

      setLastTransaction({ paymentTx: (confirmed.data as any).paymentTx, mintTx: (confirmed.data as any).mintTx });
      flash(`Collected for ${paymentMethod === "usdc" ? (prep.data as any).priceUsdc + " USDC" : price + " XLM"}. The contestant payment split was submitted on-chain.`, "ok");
      setSelected(null);
    } catch (error: any) {
      const message = String(error?.message ?? "");
      if (message === "balance_insufficient") {
        flash(paymentMethod === "usdc" ? "Not enough test USDC — use the faucet first." : "Not enough XLM — fund your wallet first.", "err");
      } else {
        flash(message.includes("balance") || message.includes("trustline") ? "Not enough test USDC — use the faucet first." : `Could not collect: ${message}`, "err");
      }
    } finally {
      setBusy("");
      load();
      refreshBalance();
    }
  }

  const selectedPrice = selected ? (paymentMethod === "usdc" ? selected.priceUsdc : selected.priceUsdc * 10) : 0;
  const selectedBalance = paymentMethod === "usdc" ? balanceUsdc : balanceXlm;
  const isDemoMode = !process.env.STELLAR_MODE || process.env.STELLAR_MODE === "mock";

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionHeader
          className="mb-0"
          eyebrow="Support the crown"
          title="Collect official contestant portraits"
          description="Each collectible is a digital keepsake tied to a contestant. In live mode, USDC or XLM payments are split on-chain so the contestant receives their share transparently."
        />
        {address && (
          <Card className="min-w-52">
            <CardContent className="flex items-center justify-between gap-4 pt-5">
              <div className="space-y-3">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-gold-soft/40">Test USDC Balance</div>
                  <div className="mt-0.5 font-display text-2xl font-semibold text-gold">{balanceUsdc == null ? "…" : balanceUsdc.toFixed(2)} USDC</div>
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-gold-soft/40">XLM Balance</div>
                  <div className="mt-0.5 font-display text-lg font-semibold text-gold-soft/70">{balanceXlm == null ? "…" : balanceXlm.toFixed(2)} XLM</div>
                </div>
              </div>
              <Button size="sm" variant="secondary" disabled={busy === "faucet"} onClick={getTestUsdc}>
                <WalletCards size={15} />
                {busy === "faucet" ? "Sending…" : "Get USDC"}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {isDemoMode && (
        <div className="mb-6 rounded-2xl border border-gold/20 bg-gold/5 px-4 py-3 text-sm text-gold-soft/80">
          ✨ <strong className="text-gold">Demo/Mock Mode Active</strong>: Checkout is simulated, but your wallet balance will still be verified.
        </div>
      )}

      {lastTransaction && (
        <div className="rounded-2xl border border-emerald/30 bg-emerald/10 p-4 text-sm text-gold-soft">
          <div className="font-semibold text-white">Confirmed on Stellar Testnet</div>
          <p className="mt-1 text-gold-soft/65">The payment split and collectible mint are recorded as separate transactions.</p>
          <div className="mt-3 flex flex-wrap gap-3">
            {testnetTransactionUrl(lastTransaction.paymentTx) && <a className="font-semibold text-gold underline underline-offset-2" href={testnetTransactionUrl(lastTransaction.paymentTx)!} target="_blank" rel="noopener noreferrer">View payment split</a>}
            {testnetTransactionUrl(lastTransaction.mintTx) && <a className="font-semibold text-gold underline underline-offset-2" href={testnetTransactionUrl(lastTransaction.mintTx)!} target="_blank" rel="noopener noreferrer">View collectible mint</a>}
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <EmptyState title="No collectibles are available" description="Contestant collectibles will appear here after an administrator publishes them." />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((collectible) => (
            <Card key={collectible.id} className="overflow-hidden p-3 transition hover:-translate-y-0.5 hover:border-gold/35">
              <Portrait id={collectible.contestant.id} name={collectible.contestant.name} sash={collectible.contestant.sash} />
              <CardContent className="px-2 pb-2 pt-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate font-display text-xl font-semibold text-white">{collectible.contestant.name}</h2>
                    <p className="mt-1 text-sm text-gold-soft/45">{collectible.contestant.country} · {collectible.title}</p>
                  </div>
                  <Badge tone="gold" className="shrink-0">{collectible.priceUsdc} USDC / {collectible.priceUsdc * 10} XLM</Badge>
                </div>
                {collectible.tokenId && <div className="mono mt-3 text-[11px] text-emerald">Token {short(collectible.tokenId, 7)}</div>}
                <Button className="mt-4 w-full" variant="secondary" onClick={() => setSelected(collectible)}>
                  <Gem size={16} />
                  View collectible
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ConfirmModal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        onConfirm={buy}
        title={selected ? `Collect ${selected.contestant.name}` : "Collect portrait"}
        description="Review the collectible and payment before opening Freighter."
        confirmLabel={selected ? `Collect for ${selectedPrice} ${paymentMethod.toUpperCase()}` : "Collect"}
        pendingLabel="Confirm in wallet…"
        pending={Boolean(selected && busy === selected.id)}
      >
        {selected && (
          <div className="grid gap-5 sm:grid-cols-[150px_1fr]">
            <Portrait id={selected.contestant.id} name={selected.contestant.name} sash={selected.contestant.sash} />
            <div className="space-y-4">
              <div>
                <Badge tone="gold">Official portrait</Badge>
                <h3 className="mt-3 font-display text-2xl font-semibold text-white">{selected.title}</h3>
                <p className="mt-1 text-sm text-gold-soft/50">{selected.contestant.country} · sash {selected.contestant.sash}</p>
              </div>

              <div className="rounded-2xl border border-line bg-black/10 p-3 space-y-2">
                <SelectField
                  id="collectible-payment-method"
                  label="Select Payment Method"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as "usdc" | "xlm")}
                >
                  <option value="usdc">USDC Token (Soroban SPLIT)</option>
                  <option value="xlm">XLM Native (Direct Multi-Payment)</option>
                </SelectField>
              </div>

              <dl className="space-y-2 rounded-2xl border border-line bg-black/25 p-4 text-sm">
                <div className="flex justify-between gap-4"><dt className="text-gold-soft/45">Price</dt><dd className="font-semibold text-gold">{selectedPrice} {paymentMethod.toUpperCase()}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-gold-soft/45">Wallet</dt><dd className="mono text-xs text-gold-soft">{address ? short(address, 8) : "Not connected"}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-gold-soft/45">Network</dt><dd className="text-gold-soft">Stellar testnet or local demo</dd></div>
              </dl>
              {selectedBalance != null && selectedBalance < selectedPrice && (
                <p className="rounded-2xl border border-ruby/30 bg-ruby/10 px-4 py-3 text-sm text-ruby">
                  Your test {paymentMethod.toUpperCase()} balance may be too low for this collectible.
                </p>
              )}
              {!fan && <p className="text-sm text-ruby">Connect Freighter before collecting.</p>}
            </div>
          </div>
        )}
      </ConfirmModal>

      <Toast msg={toast.msg} tone={toast.tone} />
    </div>
  );
}

export default function CollectPage() {
  return (
    <Suspense fallback={<div className="text-center py-12 text-gold-soft/50">Loading collectibles…</div>}>
      <CollectPageInner />
    </Suspense>
  );
}
