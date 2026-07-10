import { CheckCircle2 } from "lucide-react";
import { Button, ButtonLink, Card, CardContent } from "@/components/ui-kit";
import { TICKETING_COPY } from "@/lib/tickets/ticketCopy";

type TicketSuccessBannerProps = { ticketId: string | null; onDismiss: () => void };

export function TicketSuccessBanner({ ticketId, onDismiss }: TicketSuccessBannerProps) {
  if (!ticketId) return null;
  return (
    <Card className="mt-6 border-emerald/30 bg-emerald/5">
      <CardContent className="flex items-start gap-4 pt-5">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-emerald/15 text-emerald"><CheckCircle2 size={22} /></span>
        <div className="flex-1">
          <h3 className="font-display text-xl font-semibold text-white">{TICKETING_COPY.successTitle}</h3>
          <p className="mt-1 text-sm text-gold-soft/50">{TICKETING_COPY.successDescription}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <ButtonLink href={`/tickets/${ticketId}`} size="sm">View claim voucher</ButtonLink>
            <ButtonLink href={`/tickets/verify/${ticketId}`} size="sm" variant="secondary">Test QR verification</ButtonLink>
            <Button size="sm" variant="ghost" onClick={onDismiss}>Dismiss</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
