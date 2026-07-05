import { sha256Hex } from "./merkle";

export interface TallyEntry {
  contestantId: string;
  name: string;
  votes: number;
}

// A stable hash over the aggregated tally, anchored alongside the Merkle root.
export function tallyHash(entries: TallyEntry[]): string {
  const canonical = [...entries]
    .sort((a, b) => a.contestantId.localeCompare(b.contestantId))
    .map((e) => `${e.contestantId}:${e.votes}`)
    .join(",");
  return sha256Hex(canonical);
}
