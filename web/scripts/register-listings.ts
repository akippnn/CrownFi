import { PrismaClient } from "@prisma/client";
import { setListing } from "../src/lib/stellar";

// Registers a sale-splitter listing (price + contestant payee) for every collectible that doesn't
// have one yet, and saves the on-chain listingId back to the DB. Idempotent — re-runnable.
const db = new PrismaClient();
const PAYOUT = process.env.DEMO_CONTESTANT_PAYOUT;

async function main() {
  if ((process.env.STELLAR_MODE ?? "mock") !== "live") throw new Error("Set STELLAR_MODE=live in .env first.");
  if (!PAYOUT) throw new Error("Set DEMO_CONTESTANT_PAYOUT in .env (the contestant payout wallet).");

  const collectibles = await db.collectible.findMany({ orderBy: { createdAt: "asc" } });
  const used = collectibles.map((c: { listingId: number | null }) => c.listingId).filter((x: number | null): x is number => x != null);
  let nextId = used.length ? Math.max(...used) + 1 : 1;

  for (const c of collectibles) {
    if (c.listingId != null) {
      console.log(`skip "${c.title}" (already listing #${c.listingId})`);
      continue;
    }
    const listingId = nextId++;
    console.log(`registering "${c.title}" -> listing #${listingId} @ ${c.priceUsdc} USDC ...`);
    const { txHash } = await setListing({ listingId, priceUsdc: c.priceUsdc, contestantAddress: PAYOUT });
    await db.collectible.update({ where: { id: c.id }, data: { listingId } });
    console.log(`   ok (tx ${txHash.slice(0, 12)}...)`);
  }
  console.log("All collectibles listed.");
}
main().finally(() => db.$disconnect());
