import Link from "next/link";
import { short } from "@/lib/format";
import { ticketSeatLabel } from "@/lib/tickets/seat";
import { TICKETING_COPY } from "@/lib/tickets/ticketCopy";
import type { Ticket } from "./types";
import { TicketStatusBadge } from "./TicketStatusBadge";

type TicketListProps = {
  tickets: Ticket[];
  onChooseSeat: (ticket: Ticket) => void;
};

export function TicketList({ tickets, onChooseSeat }: TicketListProps) {
  if (tickets.length === 0) return null;

  return (
    <div className="mt-10">
      <h2 className="mb-3 font-display text-2xl text-[#23252f]">{TICKETING_COPY.ticketsHeading}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {tickets.map((t) => (
          <div key={t.id} className="glass overflow-hidden flex flex-col justify-between">
            <div className="flex items-stretch h-full">
              <div className="grid w-24 shrink-0 place-items-center bg-gradient-to-b from-[#d4af37] to-[#b8912f] text-[#1a1f35]">
                <div className="text-center px-1">
                  <div className="font-display text-lg font-bold">{t.tier}</div>
                  <div className="text-[10px] tracking-wider opacity-75">SEAT</div>
                  <div className="text-xs font-semibold uppercase truncate">{ticketSeatLabel(t.seat)}</div>
                </div>
              </div>
              <div className="flex-1 p-4 flex flex-col justify-between">
                <div>
                  <div className="font-medium text-[#23252f]">{t.eventName}</div>
                  <div className="text-xs text-[#7a7768]">{t.priceUsdc} USDC</div>
                  <div className="mt-2 text-xs font-semibold">
                    {t.seat === "Unassigned" ? (
                      <span className="text-amber-600">Seat: Not selected yet</span>
                    ) : (
                      <span className="text-emerald-700">Seat: {t.seat}</span>
                    )}
                  </div>
                  {t.tokenId && <div className="mono mt-2 text-[11px] text-emerald font-semibold">NFT {short(t.tokenId, 6)}</div>}
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between border-t border-[#e7e2d3] pt-3 gap-2">
                  <TicketStatusBadge status={t.status} />
                  <div className="flex items-center gap-2">
                    {t.seat === "Unassigned" ? (
                      <button onClick={() => onChooseSeat(t)} className="btn-gold !px-3 !py-1 text-xs font-semibold">
                        Choose Seat
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => onChooseSeat(t)}
                          className="text-xs text-[#b8912f] underline hover:text-[#a97f16] font-semibold"
                        >
                          Change Seat
                        </button>
                        <Link href={`/tickets/${t.id}`} className="btn-ghost !px-3 !py-1 text-xs font-semibold !rounded-full">
                          Claim Voucher
                        </Link>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
