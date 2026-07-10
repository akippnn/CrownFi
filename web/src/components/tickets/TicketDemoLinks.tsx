import Link from "next/link";
import { TICKETING_COPY } from "@/lib/tickets/ticketCopy";

export function TicketDemoLinks() {
  return (
    <div className="mt-8 border-t border-[#e7e2d3] pt-6">
      <h3 className="text-sm font-semibold text-[#23252f]">{TICKETING_COPY.demoHeading}</h3>
      <p className="text-xs text-[#7a7768] mt-1 leading-relaxed">
        {TICKETING_COPY.demoDescription}{" "}
        <Link href="/tickets/demo-ticket-12345" className="text-[#b8912f] font-semibold underline hover:text-[#a97f16]">
          {TICKETING_COPY.voucherDemoLink}
        </Link>{" "}
        or the{" "}
        <Link href="/tickets/verify/demo-ticket-12345" className="text-[#b8912f] font-semibold underline hover:text-[#a97f16]">
          {TICKETING_COPY.verifyDemoLink}
        </Link>{" "}
        (where you can scan and mark it as redeemed).
      </p>
    </div>
  );
}
