export function ticketSeatLabel(seat: string): string {
  if (!seat || seat === "Unassigned") return "TBD";
  return seat.replace("Row ", "R").replace(" Seat ", "S");
}

export function convertToSeatId(seatStr: string, tier: string): string | undefined {
  if (!seatStr || seatStr === "Unassigned") return undefined;
  const m = seatStr.match(/Row\s+(\d+)\s+Seat\s+(\d+)/i);
  if (!m) return undefined;
  return `${tier[0]}-${m[1]}-${m[2]}`;
}
