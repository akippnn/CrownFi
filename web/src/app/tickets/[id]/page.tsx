"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Icons } from "@/components/icons";
import { getJson } from "@/lib/api";

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

/* ── tier visual mapping ───────────────────────────── */
const TIER_COLORS: Record<string, { gradient: string; accent: string; badge: string }> = {
  Silver:  { gradient: "from-[#b8c6db] to-[#8e9aad]", accent: "#8e9aad", badge: "bg-[#b8c6db]/20 text-[#5a6577] border-[#b8c6db]/40" },
  Gold:    { gradient: "from-[#d4af37] to-[#b8912f]", accent: "#b8912f", badge: "bg-[#faf0d2]/60 text-[#8a6d1f] border-[#d4af37]/40" },
  Diamond: { gradient: "from-[#7b68ee] to-[#5b4fc7]", accent: "#5b4fc7", badge: "bg-[#ede9ff]/60 text-[#4a3db8] border-[#7b68ee]/40" },
};

export default function TicketPrintPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [origin, setOrigin] = useState("http://localhost:3000");

  useEffect(() => {
    if (typeof window !== "undefined") setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getJson<{ ok: boolean; ticket?: Ticket; error?: string }>(`/api/tickets/${id}`, { ok: false, error: "Failed to load ticket" })
      .then((res) => {
        if (res.ticket) setTicket(res.ticket);
        else setError(res.error || "Ticket not found");
      })
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, [id]);

  const handlePrint = () => window.print();

  /* ── loading state ───────────────────────────── */
  if (loading) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3">
        <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-[#d4af37] border-t-transparent"></div>
        <p className="text-sm text-[#7a7768]">Loading voucher…</p>
      </div>
    );
  }

  /* ── error state ─────────────────────────────── */
  if (error || !ticket) {
    return (
      <div className="mx-auto max-w-md text-center py-16">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-red-50 text-red-500">
          <Icons.X size={26} strokeWidth={2.5} />
        </div>
        <h2 className="font-display text-2xl font-bold text-[#23252f]">Voucher Not Found</h2>
        <p className="mt-2 text-sm text-[#7a7768]">{error || "Could not retrieve the claim voucher."}</p>
        <button onClick={() => router.push("/tickets")} className="btn-ghost mt-6">Back to Tickets</button>
      </div>
    );
  }

  /* ── derived data ────────────────────────────── */
  const verifyUrl = `${origin}/tickets/verify/${ticket.id}`;
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(verifyUrl)}&color=23252f&bgcolor=FFFFFF`;
  const dateIssued = new Date(ticket.createdAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const timeIssued = new Date(ticket.createdAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  const voucherCode = `CF-${ticket.id.slice(0, 8).toUpperCase()}`;
  const tierStyle = TIER_COLORS[ticket.tier] ?? TIER_COLORS.Gold;
  const walletShort = ticket.fan.walletAddress
    ? `${ticket.fan.walletAddress.slice(0, 6)}…${ticket.fan.walletAddress.slice(-6)}`
    : "—";

  return (
    <div className="min-h-screen pb-12">
      {/* ═══════════════ On-Screen Action Bar (hidden in print) ═══════════════ */}
      <div className="no-print mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-[#eee6d3] pb-5">
        <div>
          <Link href="/tickets" className="inline-flex items-center gap-1.5 text-sm text-[#7a7768] hover:text-[#23252f] transition">
            <Icons.Prev size={14} /> Back to My Tickets
          </Link>
          <h1 className="mt-1 font-display text-3xl font-semibold text-[#23252f]">Claim Ticket Voucher</h1>
          <p className="mt-1 text-xs text-[#7a7768]">Print or save as PDF to present at the venue entrance.</p>
        </div>
        <button onClick={handlePrint} className="btn-gold !gap-2 !px-6">
          <Icons.Verify size={16} /> Print / Save PDF
        </button>
      </div>

      {/* ═══════════════ PRINTABLE VOUCHER ═══════════════ */}
      <div className="ticket-print-area mx-auto max-w-[820px] bg-white text-[#23252f] font-sans leading-tight shadow-[0_24px_80px_-16px_rgba(120,100,40,0.18)] border border-[#e7e2d3] rounded-2xl overflow-hidden print-no-radius">

        {/* ── TOP STRIP: gradient accent ────────────────── */}
        <div className={`h-2 bg-gradient-to-r ${tierStyle.gradient}`}></div>

        {/* ── HEADER ───────────────────────────────────── */}
        <div className="px-8 pt-6 pb-5 flex items-start justify-between gap-4 border-b border-[#eee6d3]">
          <div className="flex items-center gap-3">
            <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br ${tierStyle.gradient} text-white shadow-md`}>
              <Icons.Crown size={22} strokeWidth={1.75} />
            </div>
            <div>
              <div className="font-display text-xl font-bold tracking-tight text-[#23252f]">CrownFi</div>
              <div className="text-[10px] text-[#7a7768] font-medium tracking-wider uppercase">Blockchain Ticketing · Stellar Network</div>
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[10px] text-[#7a7768] uppercase font-bold tracking-wider">Voucher No.</div>
            <div className="mono text-sm font-bold text-[#23252f] mt-0.5">{voucherCode}</div>
          </div>
        </div>

        {/* ── IMPORTANT NOTICE BANNER ─────────────────── */}
        <div className="mx-6 mt-5 rounded-xl border border-[#f0d9a0] bg-[#fffcf2] px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#d4af37]/15 text-[#b8912f] mt-0.5">
              <Icons.Verify size={16} strokeWidth={2} />
            </div>
            <div>
              <div className="text-xs font-bold text-[#6b5410] uppercase tracking-wide">Important — Redemption Notice</div>
              <p className="mt-1.5 text-[11px] text-[#7a6d4d] leading-[1.6]">
                This is a <strong>digital claim voucher</strong> and not your actual ticket. Present this voucher (printed or digital) along with a valid government-issued ID at the venue entrance. 
                <strong> Redemption can only be done once.</strong> The QR code on this voucher is uniquely linked to your purchase and will be invalidated after first scan.
              </p>
            </div>
          </div>
        </div>

        {/* ── MAIN BODY: 2 columns ────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-[1.4fr_1fr] gap-0 mt-5">

          {/* LEFT COLUMN — event + transaction details */}
          <div className="px-8 pb-6 space-y-5">

            {/* Event header card */}
            <div className="rounded-xl border border-[#e7e2d3] overflow-hidden">
              <div className={`bg-gradient-to-r ${tierStyle.gradient} px-5 py-4 text-white`}>
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-80">Event</div>
                <div className="font-display text-xl font-bold mt-0.5 tracking-tight">{ticket.eventName}</div>
              </div>
              <div className="grid grid-cols-3 divide-x divide-[#eee6d3] bg-[#faf7ef]">
                <div className="px-4 py-3 text-center">
                  <div className="text-[9px] text-[#7a7768] uppercase font-bold tracking-wider">Tier</div>
                  <div className="text-sm font-bold text-[#23252f] mt-0.5">{ticket.tier}</div>
                </div>
                <div className="px-4 py-3 text-center">
                  <div className="text-[9px] text-[#7a7768] uppercase font-bold tracking-wider">Seat</div>
                  <div className="text-sm font-bold text-[#23252f] mt-0.5">{ticket.seat}</div>
                </div>
                <div className="px-4 py-3 text-center">
                  <div className="text-[9px] text-[#7a7768] uppercase font-bold tracking-wider">Price</div>
                  <div className="text-sm font-bold text-[#23252f] mt-0.5">{ticket.priceUsdc} <span className="text-[10px] font-medium text-[#7a7768]">USDC</span></div>
                </div>
              </div>
            </div>

            {/* Transaction details table */}
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#7a7768] mb-2">Transaction Details</div>
              <table className="w-full text-[11px] border-collapse">
                <thead>
                  <tr className="border-b-2 border-[#eee6d3]">
                    <th className="py-2 text-left font-bold text-[#23252f] uppercase text-[9px] tracking-wider">Qty</th>
                    <th className="py-2 text-left font-bold text-[#23252f] uppercase text-[9px] tracking-wider">Description</th>
                    <th className="py-2 text-right font-bold text-[#23252f] uppercase text-[9px] tracking-wider">Unit Price</th>
                    <th className="py-2 text-right font-bold text-[#23252f] uppercase text-[9px] tracking-wider">Total</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-[#f0ece0]">
                    <td className="py-2.5 text-[#3a3f52]">1</td>
                    <td className="py-2.5 text-[#3a3f52]">
                      {ticket.tier} Admission — {ticket.eventName}
                      <div className="text-[9px] text-[#9a968b] mt-0.5">Seat {ticket.seat} · NFT-backed digital ticket</div>
                    </td>
                    <td className="py-2.5 text-right text-[#3a3f52]">{ticket.priceUsdc.toFixed(2)}</td>
                    <td className="py-2.5 text-right font-bold text-[#23252f]">{ticket.priceUsdc.toFixed(2)}</td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-[#eee6d3]">
                    <td colSpan={3} className="py-2.5 text-right font-bold uppercase text-[9px] tracking-wider text-[#7a7768]">Total (USDC)</td>
                    <td className="py-2.5 text-right font-display text-base font-bold text-[#23252f]">{ticket.priceUsdc.toFixed(2)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Buyer info */}
            <div className="space-y-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#7a7768]">Buyer Information</div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-[#faf7ef] border border-[#eee6d3] px-3.5 py-2.5">
                  <div className="text-[9px] text-[#9a968b] uppercase font-bold tracking-wider">Name / Handle</div>
                  <div className="text-xs font-semibold text-[#23252f] mt-0.5">@{ticket.fan.handle}</div>
                </div>
                <div className="rounded-lg bg-[#faf7ef] border border-[#eee6d3] px-3.5 py-2.5">
                  <div className="text-[9px] text-[#9a968b] uppercase font-bold tracking-wider">Purchase Date</div>
                  <div className="text-xs font-semibold text-[#23252f] mt-0.5">{dateIssued}</div>
                </div>
                <div className="rounded-lg bg-[#faf7ef] border border-[#eee6d3] px-3.5 py-2.5 col-span-2">
                  <div className="text-[9px] text-[#9a968b] uppercase font-bold tracking-wider">Stellar Wallet Address</div>
                  <div className="mono text-[11px] text-[#3a3f52] mt-0.5 truncate">{walletShort}</div>
                </div>
              </div>
            </div>

            {/* Blockchain verification */}
            {(ticket.tokenId || ticket.mintTx) && (
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-4 space-y-2">
                <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-700 flex items-center gap-1.5">
                  <Icons.Check size={12} strokeWidth={3} /> On-Chain Verification
                </div>
                {ticket.tokenId && (
                  <div>
                    <div className="text-[9px] text-emerald-600/70 uppercase font-bold tracking-wider">NFT Token ID</div>
                    <div className="mono text-[10px] text-emerald-800 mt-0.5 break-all">{ticket.tokenId}</div>
                  </div>
                )}
                {ticket.mintTx && (
                  <div>
                    <div className="text-[9px] text-emerald-600/70 uppercase font-bold tracking-wider">Mint Transaction</div>
                    <div className="mono text-[10px] text-emerald-800 mt-0.5 break-all">{ticket.mintTx}</div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* RIGHT COLUMN — QR & proof of payment */}
          <div className="border-t md:border-t-0 md:border-l border-[#eee6d3] flex flex-col items-center justify-between px-6 py-6 bg-[#faf7ef]/50">

            {/* QR block */}
            <div className="w-full flex flex-col items-center">
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#7a7768]">Scan to Verify</div>

              <div className="mt-4 relative">
                {/* decorative corner marks */}
                <div className="absolute -top-1.5 -left-1.5 w-5 h-5 border-t-[3px] border-l-[3px] rounded-tl-md" style={{ borderColor: tierStyle.accent }}></div>
                <div className="absolute -top-1.5 -right-1.5 w-5 h-5 border-t-[3px] border-r-[3px] rounded-tr-md" style={{ borderColor: tierStyle.accent }}></div>
                <div className="absolute -bottom-1.5 -left-1.5 w-5 h-5 border-b-[3px] border-l-[3px] rounded-bl-md" style={{ borderColor: tierStyle.accent }}></div>
                <div className="absolute -bottom-1.5 -right-1.5 w-5 h-5 border-b-[3px] border-r-[3px] rounded-br-md" style={{ borderColor: tierStyle.accent }}></div>

                <div className="bg-white rounded-xl p-3 shadow-[0_4px_20px_-6px_rgba(120,100,40,0.15)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={qrCodeUrl}
                    alt="Ticket Verification QR Code"
                    width={180}
                    height={180}
                    className="mx-auto block"
                  />
                </div>
              </div>

              {/* voucher code */}
              <div className="mt-4 text-center">
                <div className="mono text-lg font-bold tracking-[0.25em] text-[#23252f]">{voucherCode}</div>
                <div className="text-[9px] text-[#9a968b] mt-1 max-w-[200px] leading-relaxed">
                  Scan this QR code at the entrance gate or visit the verification URL.
                </div>
              </div>
            </div>

            {/* Divider */}
            <div className="w-full my-5 flex items-center gap-3">
              <div className="flex-1 border-t border-dashed border-[#dcd6c6]"></div>
              <Icons.Crown size={14} className="text-[#c9a227] shrink-0" />
              <div className="flex-1 border-t border-dashed border-[#dcd6c6]"></div>
            </div>

            {/* Proof of payment */}
            <div className="w-full text-center space-y-3">
              <div className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${tierStyle.badge}`}>
                <Icons.Tickets size={12} /> {ticket.tier} Tier
              </div>

              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#7a7768]">Proof of Payment</div>
                <div className="text-[9px] text-[#9a968b] mt-0.5">
                  Issued {dateIssued} at {timeIssued}
                </div>
              </div>

              <div className={`rounded-lg px-3 py-2 text-[10px] font-bold uppercase tracking-wider
                ${ticket.status === "redeemed"
                  ? "bg-red-50 text-red-600 border border-red-100"
                  : "bg-emerald-50 text-emerald-700 border border-emerald-100"
                }`}>
                Status: {ticket.status}
              </div>
            </div>
          </div>
        </div>

        {/* ── TEAR LINE ────────────────────────────────── */}
        <div className="relative mx-6 my-0">
          <div className="border-t-2 border-dashed border-[#d9d3c3]"></div>
          <span className="absolute left-1/2 -translate-x-1/2 -top-2.5 bg-white px-3 text-[8px] text-[#b8b0a0] uppercase tracking-[0.25em] font-bold select-none">
            ✂ Cut Along Line
          </span>
        </div>

        {/* ── FOOTER: terms + issuer ───────────────────── */}
        <div className="px-8 pt-4 pb-5 space-y-3">

          {/* Terms */}
          <div className="text-[9px] text-[#9a968b] leading-[1.7] space-y-1">
            <p>
              <strong className="text-[#7a7768]">Terms & Conditions:</strong> This voucher is non-transferable. Only the registered wallet holder may redeem this ticket. 
              Ticket redemption is handled on the Stellar blockchain; once scanned and verified, this voucher becomes invalid for further use. 
              CrownFi is not responsible for lost or stolen vouchers. By presenting this voucher, you agree to all event terms and conditions.
            </p>
            <p>
              <strong className="text-[#7a7768]">Need help?</strong> Contact support at <span className="text-[#b8912f] font-semibold">support@crownfi.app</span> or 
              visit <span className="text-[#b8912f] font-semibold">crownfi.app/help</span>.
            </p>
          </div>

          {/* Issuer line */}
          <div className="flex items-center justify-between border-t border-[#eee6d3] pt-3">
            <div className="flex items-center gap-2">
              <Icons.Crown size={14} strokeWidth={1.75} className="text-[#c9a227]" />
              <span className="text-[10px] font-bold text-[#9a968b] tracking-wider uppercase">CrownFi — Powered by Stellar</span>
            </div>
            <div className="mono text-[9px] text-[#b8b0a0]">Page 1 / 1</div>
          </div>
        </div>
      </div>

      {/* ═══════════════ PRINT CSS ═══════════════ */}
      <style jsx global>{`
        @media print {
          body {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            background: white !important;
          }
          header, footer, nav, .no-print {
            display: none !important;
          }
          main {
            padding: 0 !important;
            margin: 0 !important;
            max-width: 100% !important;
          }
          .ticket-print-area {
            box-shadow: none !important;
            border: none !important;
            margin: 0 auto !important;
            max-width: 100% !important;
            width: 100% !important;
            border-radius: 0 !important;
          }
          .print-no-radius {
            border-radius: 0 !important;
          }
        }
      `}</style>
    </div>
  );
}
