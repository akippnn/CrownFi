import { Check } from "lucide-react";
import { Badge, Card, CardContent } from "@/components/ui-kit";
import type { TicketTierView } from "./types";
import { TICKETING_COPY } from "@/lib/tickets/ticketCopy";

type TicketTierSelectorProps = {
  tiers: TicketTierView[];
  selectedTier: string;
  onSelectTier: (tier: string) => void;
};

export function TicketTierSelector({ tiers, selectedTier, onSelectTier }: TicketTierSelectorProps) {
  return (
    <section aria-labelledby="ticket-tier-heading">
      <h2 id="ticket-tier-heading" className="mb-3 font-display text-2xl font-semibold text-white">{TICKETING_COPY.tierHeading}</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiers.map((tier) => {
          const selected = selectedTier === tier.name;
          return (
            <button key={tier.name} type="button" onClick={() => onSelectTier(tier.name)} className="text-left">
              <Card className={`h-full transition hover:-translate-y-0.5 hover:border-gold/35 ${selected ? "border-gold/60 bg-gold/10 ring-1 ring-gold/35" : ""}`}>
                <CardContent className="pt-5">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-display text-xl font-semibold text-white">{tier.name}</h3>
                    {selected ? <span className="grid h-7 w-7 place-items-center rounded-full bg-gold text-black"><Check size={15} strokeWidth={3} /></span> : <span className="h-7 w-7 rounded-full border border-gold/20" />}
                  </div>
                  <div className="mt-4 text-3xl font-semibold text-gold">{tier.price}<span className="ml-1 text-sm font-medium text-gold-soft/45">USDC</span></div>
                  <p className="mt-3 text-sm leading-6 text-gold-soft/50">{tier.perks}</p>
                  <Badge tone={selected ? "gold" : "neutral"} className="mt-4">{selected ? "Selected" : "Select tier"}</Badge>
                </CardContent>
              </Card>
            </button>
          );
        })}
      </div>
    </section>
  );
}
