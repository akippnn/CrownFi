import { TICKETING_COPY } from "@/lib/tickets/ticketCopy";

type TicketCheckoutPanelProps = {
  busy: boolean;
  fanConnected: boolean;
  tier: string;
  onBuy: () => void;
};

export function TicketCheckoutPanel({ busy, fanConnected, tier, onBuy }: TicketCheckoutPanelProps) {
  return (
    <div className="mt-8 border-t border-[#e7e2d3] pt-6 flex flex-wrap items-center justify-between gap-4">
      <div>
        <h3 className="font-display text-lg font-semibold text-[#23252f]">{TICKETING_COPY.bookingHeading}</h3>
        <p className="text-xs text-[#7a7768] mt-0.5">{TICKETING_COPY.bookingDescription}</p>
      </div>
      <div className="flex items-center gap-3">
        <button className="btn-gold" disabled={busy || !fanConnected} onClick={onBuy}>
          {busy ? "Confirm in wallet…" : `Buy ${tier} Ticket`}
        </button>
        {!fanConnected && <span className="text-sm text-[#7a7768]">{TICKETING_COPY.connectToBuy}</span>}
      </div>
    </div>
  );
}
