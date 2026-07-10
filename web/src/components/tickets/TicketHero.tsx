import { WalletCards } from "lucide-react";
import { Button, Card, CardContent, SectionHeader } from "@/components/ui-kit";
import { TICKETING_COPY } from "@/lib/tickets/ticketCopy";

type TicketHeroProps = {
  hasAddress: boolean;
  balance: number | null;
  busy: boolean;
  onGetTestUsdc: () => void;
};

export function TicketHero({ hasAddress, balance, busy, onGetTestUsdc }: TicketHeroProps) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <SectionHeader
        className="mb-0"
        eyebrow={TICKETING_COPY.heroEyebrow}
        title={TICKETING_COPY.heroTitle}
        description="Choose a ticket tier, pay with test USDC, and receive a verifiable digital pass with a seat. Programmable controls reduce counterfeit and resale abuse, but cannot eliminate off-platform scalping."
      />
      {hasAddress && (
        <Card className="min-w-52">
          <CardContent className="flex items-center justify-between gap-4 pt-5">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold-soft/40">{TICKETING_COPY.testUsdcLabel}</div>
              <div className="mt-1 font-display text-3xl font-semibold text-gold">{balance == null ? "…" : balance.toFixed(2)}</div>
            </div>
            <Button size="sm" variant="secondary" disabled={busy} onClick={onGetTestUsdc}>
              <WalletCards size={15} />
              {TICKETING_COPY.testUsdcButton}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
