import { SeatMap, type SeatSelection } from "@/components/SeatMap";
import { Button, Modal } from "@/components/ui-kit";
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
  return (
    <Modal
      open={Boolean(ticket)}
      onClose={onCancel}
      title={ticket ? `Choose a ${ticket.tier} seat` : "Choose a seat"}
      description="Select any available seat inside the highlighted ticket zone."
      preventClose={saving}
      className="sm:max-w-5xl"
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={saving}>Cancel</Button>
          <Button onClick={onConfirm} disabled={saving || !selectedSeat}>{saving ? "Assigning seat…" : "Confirm seat"}</Button>
        </>
      }
    >
      {ticket && (
        <div className="space-y-4">
          <div className="overflow-hidden rounded-2xl border border-gold/20 bg-[#1a1f35]">
            <SeatMap tierFilter={ticket.tier as any} initialSelectedSeatId={convertToSeatId(ticket.seat, ticket.tier)} onSelect={onSelectSeat} />
          </div>
          <div className="rounded-2xl border border-line bg-black/25 px-4 py-3 text-sm text-gold-soft/55">
            {selectedSeat ? <span className="font-semibold text-emerald">Selected: row {selectedSeat.row}, seat {selectedSeat.col}</span> : "Tap an available seat to continue."}
          </div>
        </div>
      )}
    </Modal>
  );
}
