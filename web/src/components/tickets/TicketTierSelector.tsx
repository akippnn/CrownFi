import type { TicketTierView } from "./types";
import { TICKETING_COPY } from "@/lib/tickets/ticketCopy";

type TicketTierSelectorProps = {
  tiers: TicketTierView[];
  selectedTier: string;
  onSelectTier: (tier: string) => void;
};

export function TicketTierSelector({ tiers, selectedTier, onSelectTier }: TicketTierSelectorProps) {
  return (
    <div className="mb-4">
      <h2 className="font-display text-xl font-semibold text-[#23252f] mb-3">{TICKETING_COPY.tierHeading}</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiers.map((t) => (
          <button
            key={t.name}
            onClick={() => onSelectTier(t.name)}
            className={`glass p-5 text-left transition ${
              selectedTier === t.name ? "shadow-spot ring-1 ring-gold bg-[#faf7ef]" : "glass-hover"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-display text-xl text-[#23252f]">{t.name}</span>
              {selectedTier === t.name && <span className="text-[#b8912f]">●</span>}
            </div>
            <div className="mt-1 text-2xl font-semibold text-[#b8912f]">
              {t.price} <span className="text-sm text-[#7a7768]">USDC</span>
            </div>
            <div className="mt-2 text-xs text-[#6f6c5f]">{t.perks}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
