import Link from "next/link";
import { TICKETING_COPY } from "@/lib/tickets/ticketCopy";

type TicketSuccessBannerProps = {
  ticketId: string | null;
  onDismiss: () => void;
};

export function TicketSuccessBanner({ ticketId, onDismiss }: TicketSuccessBannerProps) {
  if (!ticketId) return null;

  return (
    <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 flex items-start gap-3">
      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-500 text-white mt-0.5">
        <span className="text-sm font-bold">✓</span>
      </div>
      <div className="flex-1">
        <div className="text-sm font-bold text-emerald-800">{TICKETING_COPY.successTitle}</div>
        <p className="text-xs text-emerald-700 mt-0.5">{TICKETING_COPY.successDescription}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href={`/tickets/${ticketId}`} className="btn-gold !py-1.5 !px-4 !text-xs">
            View Claim Voucher
          </Link>
          <Link href={`/tickets/verify/${ticketId}`} className="btn-ghost !py-1.5 !px-4 !text-xs">
            Test QR Verification
          </Link>
          <button onClick={onDismiss} className="text-xs text-emerald-600 underline underline-offset-2 hover:text-emerald-800">
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
