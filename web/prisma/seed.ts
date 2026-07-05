import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

async function main() {
  await db.collectible.deleteMany();
  await db.contestant.deleteMany();
  await db.votingRound.deleteMany();

  const contestants = await Promise.all(
    [
      { name: "Isabel Reyes", country: "Philippines", sash: "PH" },
      { name: "Ana Torres", country: "Mexico", sash: "MX" },
      { name: "Lucia Costa", country: "Brazil", sash: "BR" },
      { name: "Mai Tanaka", country: "Japan", sash: "JP" },
    ].map((c) => db.contestant.create({ data: { ...c, portraitUrl: `/portraits/${c.sash.toLowerCase()}.png` } }))
  );

  await db.votingRound.create({ data: { title: "People's Choice - Preliminary" } });

  for (const c of contestants) {
    await db.collectible.create({
      data: { contestantId: c.id, title: `${c.name} - Official Portrait`, metadataUri: `ipfs://demo/${c.sash.toLowerCase()}.json`, priceUsdc: 25, edition: 1 },
    });
  }
  console.log("Seeded contestants, a round, and collectibles. No demo fan accounts.");
}
main().finally(() => db.$disconnect());
