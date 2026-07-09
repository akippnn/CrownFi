"use client";
import { useState } from "react";
import Link from "next/link";
import { SeatMap, type SeatSelection } from "@/components/SeatMap";
import { TICKET_TIERS, type TierName } from "@/lib/tiers";

export default function SeatmapPage() {
  const [selection, setSelection] = useState<SeatSelection | null>(null);

  const tier = selection ? TICKET_TIERS[selection.tier] : null;

  return (
    <div>
      {/* Header */}
      <div className="mb-8 text-center">
        <div className="eyebrow mb-2">Choose Your Seat</div>
        <h1 className="font-display text-4xl font-semibold text-[#23252f] sm:text-5xl">
          Arena Seatmap
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-[#5f6172]">
          Coronation Night 2026 — SM Mall of Asia Arena.
          Pick an available seat to view details and buy your ticket.
        </p>
      </div>

      {/* Seatmap */}
      <SeatMap onSelect={(sel) => setSelection(sel)} />

      {/* Buy button */}
      {selection && tier && (
        <div className="mt-6 text-center">
          <Link
            href={`/tickets?tier=${selection.tier}`}
            className="btn-gold !py-3 !px-8 text-base"
          >
            Buy {selection.tier} · Row {selection.row} Seat {selection.col} — {tier.priceUsdc} USDC
          </Link>
        </div>
      )}

      {/* Back link */}
      <div className="mt-8 text-center">
        <Link href="/tickets" className="btn-ghost">
          ← Back to Tickets
        </Link>
      </div>
    </div>
  );
}
