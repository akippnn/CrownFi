import { FlaskConical } from "lucide-react";
import { ButtonLink, Card, CardContent } from "@/components/ui-kit";
import { TICKETING_COPY } from "@/lib/tickets/ticketCopy";

export function TicketDemoLinks() {
  return (
    <Card className="mt-8 border-dashed">
      <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-5">
        <div className="flex items-start gap-3">
          <FlaskConical className="mt-0.5 shrink-0 text-gold" size={20} />
          <div>
            <h3 className="text-sm font-semibold text-white">{TICKETING_COPY.demoHeading}</h3>
            <p className="mt-1 max-w-xl text-xs leading-5 text-gold-soft/45">{TICKETING_COPY.demoDescription}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <ButtonLink href="/tickets/demo-ticket-12345" size="sm" variant="secondary">Voucher demo</ButtonLink>
          <ButtonLink href="/tickets/verify/demo-ticket-12345" size="sm" variant="ghost">Verifier demo</ButtonLink>
        </div>
      </CardContent>
    </Card>
  );
}
