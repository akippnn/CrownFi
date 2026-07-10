import { TICKETING_COPY } from "@/lib/tickets/ticketCopy";

type TicketHeroProps = {
  hasAddress: boolean;
  balance: number | null;
  busy: boolean;
  onGetTestUsdc: () => void;
};

export function TicketHero({ hasAddress, balance, busy, onGetTestUsdc }: TicketHeroProps) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <div className="eyebrow mb-2">{TICKETING_COPY.heroEyebrow}</div>
        <h1 className="font-display text-4xl font-semibold text-[#23252f]">{TICKETING_COPY.heroTitle}</h1>
        <p className="mt-2 text-sm text-[#5f6172]">
          Pay in <b>USDC</b>, and each ticket is a verifiable digital pass with a tier and seat. Programmable controls can reduce counterfeits and resale abuse, but they do not fully eliminate off-platform scalping. <span className="tag-on ml-1">{TICKETING_COPY.onChainTag}</span>
        </p>
      </div>
      {hasAddress && (
        <div className="glass px-4 py-3 text-right">
          <div className="text-xs uppercase tracking-wider text-[#7a7768]">{TICKETING_COPY.testUsdcLabel}</div>
          <div className="font-display text-2xl font-semibold text-[#b8912f]">{balance == null ? "…" : balance.toFixed(2)}</div>
          <button className="btn-ghost mt-2 !px-3 !py-1.5 text-xs" disabled={busy} onClick={onGetTestUsdc}>
            {TICKETING_COPY.testUsdcButton}
          </button>
        </div>
      )}
    </div>
  );
}
