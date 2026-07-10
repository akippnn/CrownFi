import { WalletCards } from "lucide-react";
import { Button, Card, CardContent, SectionHeader } from "@/components/ui-kit";
import { TICKETING_COPY } from "@/lib/tickets/ticketCopy";

type TicketHeroProps = {
  hasAddress: boolean;
  balanceUsdc: number | null;
  balanceXlm: number | null;
  busy: boolean;
  onGetTestUsdc: () => void;
};

export function TicketHero({ hasAddress, balanceUsdc, balanceXlm, busy, onGetTestUsdc }: TicketHeroProps) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <SectionHeader
        className="mb-0"
        eyebrow={TICKETING_COPY.heroEyebrow}
        title={TICKETING_COPY.heroTitle}
        description="Choose a ticket tier, pay with test USDC or XLM, and receive a verifiable digital pass with a seat. Programmable controls reduce counterfeit and resale abuse, but cannot eliminate off-platform scalping."
      />
      {hasAddress && (
        <Card className="min-w-52">
          <CardContent className="flex items-center justify-between gap-4 pt-5">
            <div className="space-y-3">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-gold-soft/40">{TICKETING_COPY.testUsdcLabel}</div>
                <div className="mt-0.5 font-display text-2xl font-semibold text-gold">{balanceUsdc == null ? "…" : balanceUsdc.toFixed(2)} USDC</div>
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-gold-soft/40">XLM Balance</div>
                <div className="mt-0.5 font-display text-lg font-semibold text-gold-soft/70">{balanceXlm == null ? "…" : balanceXlm.toFixed(2)} XLM</div>
              </div>
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
