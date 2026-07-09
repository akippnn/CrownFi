"use client";
import { useState, useEffect, useMemo } from "react";
import { TIER_LIST, type TierName } from "@/lib/tiers";

/* ─── Types ───────────────────────────────────────────────────────── */

type SeatStatus = "available" | "taken" | "selected";

type Seat = {
  id: string;       // e.g. "D-1-4" = Diamond, Row 1, Seat 4
  row: number;
  col: number;
  tier: TierName;
  status: SeatStatus;
};

export type SeatSelection = {
  seatId: string;
  row: number;
  col: number;
  tier: TierName;
  label: string;    // e.g. "Row 1 · Seat 4"
};

/* ─── Tier visual config ──────────────────────────────────────────── */

const TIER_COLORS: Record<TierName, { fill: string; fillHover: string; border: string; bg: string }> = {
  Diamond:  { fill: "#d4af37", fillHover: "#e8c84a", border: "#b8912f", bg: "rgba(212,175,55,0.12)" },
  Platinum: { fill: "#7c3aed", fillHover: "#9f67ff", border: "#5b21b6", bg: "rgba(124,58,237,0.10)" },
  Gold:     { fill: "#f59e0b", fillHover: "#fbbf24", border: "#d97706", bg: "rgba(245,158,11,0.10)" },
  Silver:   { fill: "#94a3b8", fillHover: "#b0bec5", border: "#64748b", bg: "rgba(148,163,184,0.10)" },
};

const TIER_ICONS: Record<TierName, string> = {
  Diamond: "💎", Platinum: "🟣", Gold: "🥇", Silver: "🥈",
};

/* ─── Row config: which rows belong to which tier ─────────────────── */

type RowConfig = { row: number; seats: number; tier: TierName };

const ROW_CONFIGS: RowConfig[] = [
  // Diamond — rows 1–3, close to stage, fewer seats
  { row: 1, seats: 8,  tier: "Diamond" },
  { row: 2, seats: 10, tier: "Diamond" },
  { row: 3, seats: 10, tier: "Diamond" },
  // Platinum — rows 4–6
  { row: 4,  seats: 12, tier: "Platinum" },
  { row: 5,  seats: 12, tier: "Platinum" },
  { row: 6,  seats: 14, tier: "Platinum" },
  // Gold — rows 7–9
  { row: 7,  seats: 14, tier: "Gold" },
  { row: 8,  seats: 16, tier: "Gold" },
  { row: 9,  seats: 16, tier: "Gold" },
  // Silver — rows 10–12
  { row: 10, seats: 18, tier: "Silver" },
  { row: 11, seats: 18, tier: "Silver" },
  { row: 12, seats: 20, tier: "Silver" },
];

/* ─── Deterministic "taken" seats (simulated) ─────────────────────── */

function hashSeat(row: number, col: number): number {
  // Simple deterministic hash for demo taken-seats
  return ((row * 31 + col * 17 + 7) * 2654435761) >>> 0;
}

function generateSeats(): Seat[] {
  const seats: Seat[] = [];
  for (const rc of ROW_CONFIGS) {
    for (let col = 1; col <= rc.seats; col++) {
      const taken = false; // All seats available for demo
      seats.push({
        id: `${rc.tier[0]}-${rc.row}-${col}`,
        row: rc.row,
        col,
        tier: rc.tier,
        status: taken ? "taken" : "available",
      });
    }
  }
  return seats;
}

/* ─── Seat icon SVG (chair shape) ─────────────────────────────────── */

function SeatIcon({
  x, y, status, tierColor, hoverColor, isHovered,
  size = 28,
}: {
  x: number; y: number; status: SeatStatus;
  tierColor: string; hoverColor: string; isHovered: boolean;
  size?: number;
}) {
  const s = size;
  const r = s * 0.18; // corner radius

  let fill: string;
  let stroke: string;
  let opacity: number;

  switch (status) {
    case "selected":
      fill = "#d4af37";
      stroke = "#ffffff";
      opacity = 1;
      break;
    case "taken":
      fill = "#3a3f4a";
      stroke = "#2a2e38";
      opacity = 0.5;
      break;
    default: // available
      fill = isHovered ? hoverColor : tierColor;
      stroke = isHovered ? "#ffffff" : "rgba(255,255,255,0.25)";
      opacity = isHovered ? 1 : 0.85;
      break;
  }

  return (
    <g style={{ transition: "opacity 0.15s ease" }} opacity={opacity}>
      {/* Seat back */}
      <rect
        x={x - s / 2}
        y={y - s / 2}
        width={s}
        height={s * 0.45}
        rx={r}
        fill={fill}
        stroke={stroke}
        strokeWidth={status === "selected" ? 2 : 0.8}
      />
      {/* Seat bottom / cushion */}
      <rect
        x={x - s / 2 + 1}
        y={y - s / 2 + s * 0.42}
        width={s - 2}
        height={s * 0.42}
        rx={r * 0.6}
        fill={fill}
        stroke={stroke}
        strokeWidth={status === "selected" ? 2 : 0.8}
        style={{ filter: "brightness(0.85)" }}
      />
      {/* Armrests */}
      <rect x={x - s / 2 - 1.5} y={y - s / 2 + s * 0.2} width={3} height={s * 0.55} rx={1.5} fill={fill} opacity={0.7} />
      <rect x={x + s / 2 - 1.5} y={y - s / 2 + s * 0.2} width={3} height={s * 0.55} rx={1.5} fill={fill} opacity={0.7} />
      {/* Selected checkmark */}
      {status === "selected" && (
        <text x={x} y={y + 1} textAnchor="middle" dominantBaseline="central" fontSize={s * 0.38} fill="#1a1f35" fontWeight="800">
          ✓
        </text>
      )}
    </g>
  );
}

/* ─── Main component ──────────────────────────────────────────────── */

export function SeatMap({
  onSelect,
  tierFilter,
  initialSelectedSeatId
}: {
  onSelect?: (sel: SeatSelection | null) => void;
  tierFilter?: TierName;
  initialSelectedSeatId?: string;
}) {
  const [seats, setSeats] = useState<Seat[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedSeatId || null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const raw = generateSeats();
    if (initialSelectedSeatId) {
      setSeats(raw.map((s) => ({
        ...s,
        status: s.id === initialSelectedSeatId ? "selected" : s.status
      })));
    } else {
      setSeats(raw);
    }
  }, [initialSelectedSeatId]);

  useEffect(() => { const t = setTimeout(() => setVisible(true), 80); return () => clearTimeout(t); }, []);

  function handleClick(seat: Seat) {
    if (seat.status === "taken") return;
    if (tierFilter && seat.tier !== tierFilter) return;
    setSeats((prev) =>
      prev.map((s) => ({
        ...s,
        status: s.id === seat.id
          ? s.status === "selected" ? "available" : "selected"
          : s.status === "selected" ? "available" : s.status,
      }))
    );
    const newSel = seat.status === "selected" ? null : seat;
    setSelectedId(newSel ? newSel.id : null);
    onSelect?.(
      newSel
        ? { seatId: newSel.id, row: newSel.row, col: newSel.col, tier: newSel.tier, label: `Row ${newSel.row} · Seat ${newSel.col}` }
        : null
    );
  }

  /* ── Layout math ── */
  const SVG_W = 800;
  const SVG_H = 620;
  const STAGE_Y = 50;
  const FIRST_ROW_Y = 130;
  const ROW_GAP = 38;
  const SEAT_SIZE = 28;
  const SEAT_GAP = 34;

  // Group rows by tier for tier-separator rendering
  const tierBoundaries = useMemo(() => {
    const bounds: { tier: TierName; startRow: number; endRow: number; startY: number; endY: number }[] = [];
    let currentTier: TierName | null = null;
    let startRow = 0;
    for (const rc of ROW_CONFIGS) {
      if (rc.tier !== currentTier) {
        if (currentTier) {
          bounds[bounds.length - 1].endRow = rc.row - 1;
          bounds[bounds.length - 1].endY = FIRST_ROW_Y + (rc.row - 2) * ROW_GAP + SEAT_SIZE / 2 + 8;
        }
        currentTier = rc.tier;
        startRow = rc.row;
        bounds.push({
          tier: rc.tier,
          startRow,
          endRow: rc.row,
          startY: FIRST_ROW_Y + (rc.row - 1) * ROW_GAP - SEAT_SIZE / 2 - 10,
          endY: FIRST_ROW_Y + (rc.row - 1) * ROW_GAP + SEAT_SIZE / 2 + 8,
        });
      }
    }
    // Close last tier
    if (bounds.length > 0) {
      const last = ROW_CONFIGS[ROW_CONFIGS.length - 1];
      bounds[bounds.length - 1].endRow = last.row;
      bounds[bounds.length - 1].endY = FIRST_ROW_Y + (last.row - 1) * ROW_GAP + SEAT_SIZE / 2 + 8;
    }
    return bounds;
  }, []);

  const tierInfo = (t: TierName) => TIER_LIST.find((x) => x.name === t)!;

  // Stats
  const availableCount = seats.filter((s) => s.status === "available").length;
  const totalCount = seats.length;
  const selectedSeat = seats.find((s) => s.status === "selected");

  return (
    <div className={`transition-all duration-700 ${visible ? "opacity-100 scale-100" : "opacity-0 scale-[0.97]"}`}
         style={{ transformOrigin: "center top" }}>

      {/* ─── SVG SEATMAP ───────────────────────── */}
      <div className="relative rounded-2xl overflow-hidden"
           style={{ background: "linear-gradient(180deg, #1a1f35 0%, #23283d 100%)" }}>
        <svg
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          className="w-full h-auto"
          style={{ maxHeight: "65vh" }}
        >
          <defs>
            <radialGradient id="stage-light" cx="50%" cy="30%" r="60%">
              <stop offset="0%" stopColor="rgba(212,175,55,0.25)" />
              <stop offset="100%" stopColor="rgba(212,175,55,0)" />
            </radialGradient>
            <linearGradient id="stage-surface" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#e8c84a" />
              <stop offset="100%" stopColor="#b8912f" />
            </linearGradient>
          </defs>

          {/* Spotlight glow */}
          <ellipse cx={SVG_W / 2} cy={STAGE_Y + 30} rx={200} ry={80} fill="url(#stage-light)" />

          {/* ─── STAGE ─── */}
          <path
            d={`M ${SVG_W / 2 - 140} ${STAGE_Y + 40} Q ${SVG_W / 2 - 100} ${STAGE_Y} ${SVG_W / 2} ${STAGE_Y - 8} Q ${SVG_W / 2 + 100} ${STAGE_Y} ${SVG_W / 2 + 140} ${STAGE_Y + 40} Z`}
            fill="url(#stage-surface)"
            stroke="#b8912f"
            strokeWidth="1.5"
            opacity="0.9"
          />
          <text
            x={SVG_W / 2} y={STAGE_Y + 18}
            textAnchor="middle" dominantBaseline="central"
            fontSize="13" fontWeight="700" fill="#1a1f35"
            fontFamily="var(--font-display), Georgia, serif"
          >
            STAGE
          </text>

          {/* ─── TIER BACKGROUNDS ─── */}
          {tierBoundaries.map((tb) => {
            const colors = TIER_COLORS[tb.tier];
            return (
              <rect
                key={tb.tier}
                x={30} y={tb.startY}
                width={SVG_W - 60}
                height={tb.endY - tb.startY}
                rx={12}
                fill={colors.bg}
                stroke={colors.fill}
                strokeWidth="0.5"
                strokeDasharray="4 3"
                opacity="0.5"
              />
            );
          })}

          {/* ─── TIER LABELS (left side) ─── */}
          {tierBoundaries.map((tb) => {
            const colors = TIER_COLORS[tb.tier];
            const midY = (tb.startY + tb.endY) / 2;
            return (
              <g key={`label-${tb.tier}`}>
                <text
                  x={18} y={midY}
                  textAnchor="middle" dominantBaseline="central"
                  fontSize="9" fontWeight="700" fill={colors.fill}
                  style={{ writingMode: "vertical-rl" as never, textOrientation: "mixed" as never }}
                  transform={`rotate(-90, 18, ${midY})`}
                  letterSpacing="1.5"
                >
                  {tb.tier.toUpperCase()}
                </text>
              </g>
            );
          })}

          {/* ─── SEATS ─── */}
          {ROW_CONFIGS.map((rc) => {
            const rowY = FIRST_ROW_Y + (rc.row - 1) * ROW_GAP;
            const rowWidth = rc.seats * SEAT_GAP;
            const startX = (SVG_W - rowWidth) / 2 + SEAT_GAP / 2;
            const rowSeats = seats.filter((s) => s.row === rc.row);
            const colors = TIER_COLORS[rc.tier];

            // Gentle curve: seats in center are slightly closer to stage
            const curveAmount = 8 + rc.row * 0.8;

            return (
              <g key={`row-${rc.row}`}>
                {/* Row number — left */}
                <text
                  x={startX - 20} y={rowY + 4}
                  textAnchor="middle" dominantBaseline="central"
                  fontSize="10" fontWeight="600" fill="rgba(255,255,255,0.35)"
                >
                  {rc.row}
                </text>
                {/* Row number — right */}
                <text
                  x={startX + rowWidth + 6} y={rowY + 4}
                  textAnchor="middle" dominantBaseline="central"
                  fontSize="10" fontWeight="600" fill="rgba(255,255,255,0.35)"
                >
                  {rc.row}
                </text>

                {/* Seats */}
                {rowSeats.map((seat) => {
                  const seatX = startX + (seat.col - 1) * SEAT_GAP;
                  // Apply curve — center seats dip up toward stage
                  const normalizedPos = (seat.col - 1) / (rc.seats - 1) - 0.5; // -0.5 to 0.5
                  const curveOffset = normalizedPos * normalizedPos * curveAmount * 4;
                  const seatY = rowY + curveOffset;

                  const isSelectable = !tierFilter || seat.tier === tierFilter;
                  const isTaken = seat.status === "taken";

                  return (
                    <g
                      key={seat.id}
                      className={!isSelectable ? "cursor-not-allowed opacity-[0.15]" : isTaken ? "cursor-not-allowed" : "cursor-pointer"}
                      onMouseEnter={() => isSelectable && setHoveredId(seat.id)}
                      onMouseLeave={() => isSelectable && setHoveredId(null)}
                      onClick={() => isSelectable && handleClick(seat)}
                    >
                      <SeatIcon
                        x={seatX}
                        y={seatY}
                        status={seat.status}
                        tierColor={colors.fill}
                        hoverColor={colors.fillHover}
                        isHovered={hoveredId === seat.id}
                        size={SEAT_SIZE}
                      />
                    </g>
                  );
                })}
              </g>
            );
          })}

          {/* ─── HOVER TOOLTIP ─── */}
          {hoveredId && (() => {
            const seat = seats.find((s) => s.id === hoveredId);
            if (!seat) return null;
            const rc = ROW_CONFIGS.find((r) => r.row === seat.row)!;
            const rowY = FIRST_ROW_Y + (seat.row - 1) * ROW_GAP;
            const rowWidth = rc.seats * SEAT_GAP;
            const startX = (SVG_W - rowWidth) / 2 + SEAT_GAP / 2;
            const seatX = startX + (seat.col - 1) * SEAT_GAP;
            const normalizedPos = (seat.col - 1) / (rc.seats - 1) - 0.5;
            const curveAmount = 8 + seat.row * 0.8;
            const curveOffset = normalizedPos * normalizedPos * curveAmount * 4;
            const seatY = rowY + curveOffset;
            const colors = TIER_COLORS[seat.tier];
            const info = tierInfo(seat.tier);

            const tipW = 130;
            const tipH = 48;
            let tipX = seatX - tipW / 2;
            let tipY = seatY - SEAT_SIZE / 2 - tipH - 8;
            // Clamp to viewport
            if (tipX < 10) tipX = 10;
            if (tipX + tipW > SVG_W - 10) tipX = SVG_W - tipW - 10;
            if (tipY < 10) tipY = seatY + SEAT_SIZE / 2 + 8;

            return (
              <g>
                <rect x={tipX} y={tipY} width={tipW} height={tipH} rx={8} fill="#ffffff" stroke={colors.fill} strokeWidth="1.5"
                      style={{ filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.25))" }} />
                <text x={tipX + 10} y={tipY + 16} fontSize="11" fontWeight="700" fill="#23252f">
                  Row {seat.row} · Seat {seat.col}
                </text>
                <text x={tipX + 10} y={tipY + 30} fontSize="9.5" fill={colors.fill} fontWeight="600">
                  {seat.tier} · {info.priceUsdc} USDC
                </text>
                <text x={tipX + 10} y={tipY + 42} fontSize="8.5" fill="#7a7768">
                  {seat.status === "taken" ? "Unavailable" : "Click to select"}
                </text>
              </g>
            );
          })()}

        </svg>

        {/* ─── BOTTOM INFO BAR ─── */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-white/10"
             style={{ background: "rgba(26,31,53,0.95)" }}>
          {/* Legend */}
          <div className="flex flex-wrap items-center gap-3">
            {TIER_LIST.map((t) => (
              <div key={t.name} className="flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 rounded-sm" style={{ background: TIER_COLORS[t.name].fill }} />
                <span className="text-[11px] font-medium text-white/70">{t.name}</span>
                <span className="text-[10px] text-white/40">{t.priceUsdc}</span>
              </div>
            ))}
            <div className="flex items-center gap-1.5 ml-2">
              <span className="inline-block h-3 w-3 rounded-sm bg-[#3a3f4a] opacity-60" />
              <span className="text-[11px] text-white/40">Taken</span>
            </div>
          </div>

          {/* Stats */}
          <div className="text-[11px] text-white/50">
            {availableCount} of {totalCount} seats available
          </div>
        </div>
      </div>

      {/* ─── SELECTED SEAT INFO ─── */}
      {selectedSeat && (
        <div className="mt-4 glass p-4 flex items-center gap-4 animate-[fadeSlideUp_0.3s_ease-out]">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl text-xl"
               style={{ background: TIER_COLORS[selectedSeat.tier].bg, border: `1.5px solid ${TIER_COLORS[selectedSeat.tier].fill}` }}>
            {TIER_ICONS[selectedSeat.tier]}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-display text-lg font-semibold text-[#23252f]">
              Row {selectedSeat.row} · Seat {selectedSeat.col}
            </div>
            <div className="text-xs text-[#7a7768]">
              {selectedSeat.tier} · {tierInfo(selectedSeat.tier).priceUsdc} USDC · {tierInfo(selectedSeat.tier).perks}
            </div>
          </div>
          <div className="text-right">
            <div className="font-display text-2xl font-semibold text-[#b8912f]">
              {tierInfo(selectedSeat.tier).priceUsdc}
              <span className="text-sm text-[#7a7768] ml-1">USDC</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


