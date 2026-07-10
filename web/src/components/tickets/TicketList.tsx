import { Armchair, QrCode } from "lucide-react";
import { Badge, Button, ButtonLink, Card, CardContent, EmptyState } from "@/components/ui-kit";
import { short } from "@/lib/format";
import { ticketSeatLabel } from "@/lib/tickets/seat";
import { TICKETING_COPY } from "@/lib/tickets/ticketCopy";
import type { Ticket } from "./types";

type TicketListProps = { tickets: Ticket[]; onChooseSeat: (ticket: Ticket) => void };

export function TicketList({ tickets, onChooseSeat }: TicketListProps) {
  return (
    <section className="mt-10" aria-labelledby="owned-tickets-heading">
      <h2 id="owned-tickets-heading" className="mb-3 font-display text-2xl font-semibold text-white">{TICKETING_COPY.ticketsHeading}</h2>
      {tickets.length === 0 ? (
        <EmptyState title="You do not own any tickets yet" description="Choose a tier above to mint your first CrownFi event pass." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {tickets.map((ticket) => (
            <Card key={ticket.id} className="overflow-hidden">
              <div className="grid min-h-56 grid-cols-[92px_1fr]">
                <div className="flex flex-col items-center justify-center bg-gradient-to-b from-[#f3e5ab] via-gold to-gold-deep px-2 text-center text-black">
                  <div className="font-display text-lg font-bold">{ticket.tier}</div>
                  <div className="mt-4 text-[10px] font-semibold uppercase tracking-[0.18em] opacity-60">Seat</div>
                  <div className="mt-1 text-sm font-bold uppercase">{ticketSeatLabel(ticket.seat)}</div>
                </div>
                <CardContent className="flex flex-col justify-between pt-5">
                  <div>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <h3 className="font-display text-xl font-semibold text-white">{ticket.eventName}</h3>
                        <p className="mt-1 text-sm text-gold-soft/45">{ticket.priceUsdc} USDC</p>
                      </div>
                      <Badge tone={ticket.status === "redeemed" ? "danger" : "success"}>{ticket.status || "minted"}</Badge>
                    </div>
                    <div className="mt-4 flex items-center gap-2 text-sm text-gold-soft/60">
                      <Armchair size={16} className="text-gold" />
                      {ticket.seat === "Unassigned" ? "Seat not selected" : `Seat ${ticket.seat}`}
                    </div>
                    {ticket.tokenId && <div className="mono mt-3 text-[11px] text-emerald">Token {short(ticket.tokenId, 7)}</div>}
                  </div>
                  <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
                    <Button size="sm" variant={ticket.seat === "Unassigned" ? "primary" : "secondary"} onClick={() => onChooseSeat(ticket)}>
                      <Armchair size={15} /> {ticket.seat === "Unassigned" ? "Choose seat" : "Change seat"}
                    </Button>
                    {ticket.seat !== "Unassigned" && <ButtonLink href={`/tickets/${ticket.id}`} size="sm" variant="ghost"><QrCode size={15} /> Claim voucher</ButtonLink>}
                  </div>
                </CardContent>
              </div>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
