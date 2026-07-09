import { SeatMap, type SeatSelection } from "@/components/SeatMap";
import { convertToSeatId } from "@/lib/tickets/seat";
import type { Ticket } from "./types";

type SeatAssignmentModalProps = {
  ticket: Ticket | null;
  selectedSeat: SeatSelection | null;
  saving: boolean;
  onSelectSeat: (seat: SeatSelection | null) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

export function SeatAssignmentModal({ ticket, selectedSeat, saving, onSelectSeat, onCancel, onConfirm }: SeatAssignmentModalProps) {
  if (!ticket) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-[#1a1f35]/70 backdrop-blur-sm transition-opacity" onClick={() => { if (!saving) onCancel(); }} />

      <div className="relative w-full max-w-4xl glass bg-white p-6 shadow-2xl z-10 max-h-[90vh] overflow-y-auto flex flex-col justify-between rounded-3xl border border-[#eee6d3]">
        <div className="mb-4 flex items-start justify-between border-b border-[#eee6d3] pb-3">
          <div>
            <h3 className="font-display text-2xl font-semibold text-[#23252f]">Assign Seat: {ticket.tier} Tier</h3>
            <p className="mt-1 text-xs text-[#7a7768]">Select any available seat inside your highlighted <b>{ticket.tier}</b> zone.</p>
          </div>
          <button
            onClick={onCancel}
            disabled={saving}
            className="rounded-full p-1.5 text-[#7a7768] hover:bg-[#faf7ef] hover:text-[#23252f] transition"
            aria-label="Close seat assignment"
          >
            ✕
          </button>
        </div>

        <div className="my-2 border border-[#e7e2d3] rounded-2xl overflow-hidden bg-[#1a1f35]">
          <SeatMap
            tierFilter={ticket.tier as any}
            initialSelectedSeatId={convertToSeatId(ticket.seat, ticket.tier)}
            onSelect={onSelectSeat}
          />
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-[#eee6d3] pt-3">
          <div className="text-sm">
            {selectedSeat ? (
              <span className="text-emerald-700 font-semibold">Selected: Row {selectedSeat.row} · Seat {selectedSeat.col}</span>
            ) : (
              <span className="text-[#7a7768]">Please tap a seat to select.</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button onClick={onCancel} disabled={saving} className="btn-ghost !px-4 !py-2 text-xs">
              Cancel
            </button>
            <button onClick={onConfirm} disabled={saving || !selectedSeat} className="btn-gold !px-5 !py-2 text-xs">
              {saving ? "Assigning Seat…" : "Confirm Seat Choice"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
