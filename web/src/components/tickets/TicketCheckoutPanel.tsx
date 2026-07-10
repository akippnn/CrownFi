import { ArrowRight, Ticket } from "lucide-react";
import { Button, Card, CardContent } from "@/components/ui-kit";
import { TICKETING_COPY } from "@/lib/tickets/ticketCopy";

type TicketCheckoutPanelProps = {
  busy: boolean;
  fanConnected: boolean;
  tier: string;
  price: number;
  currency?: string;
  onBuy: () => void;
};

export function TicketCheckoutPanel({ busy, fanConnected, tier, price, currency = "USDC", onBuy }: TicketCheckoutPanelProps) {
  return (
    <Card className="mt-6 border-gold/25">
      <CardContent className="flex flex-wrap items-center justify-between gap-5 pt-5">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl border border-gold/20 bg-gold/10 text-gold"><Ticket size={21} /></span>
          <div>
            <h3 className="font-display text-xl font-semibold text-white">{TICKETING_COPY.bookingHeading}</h3>
            <p className="mt-1 text-sm text-gold-soft/45">{tier} tier · {price} {currency} · seat selected after purchase</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {!fanConnected && <span className="text-sm text-gold-soft/45">{TICKETING_COPY.connectToBuy}</span>}
          <Button disabled={busy || !fanConnected} onClick={onBuy}>
            Review purchase <ArrowRight size={16} />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
