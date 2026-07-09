type TicketStatusBadgeProps = {
  status?: string;
};

export function TicketStatusBadge({ status }: TicketStatusBadgeProps) {
  const value = status || "minted";
  return (
    <span
      className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
        value === "redeemed" ? "bg-red-100 text-red-700" : "bg-emerald/10 text-emerald"
      }`}
    >
      {value}
    </span>
  );
}
