import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

async function main() {
  await db.collectible.deleteMany();
  await db.contestant.deleteMany();
  await db.votingRound.deleteMany();

  const contestants = await Promise.all(
    [
      { name: "Isabel Reyes", country: "Philippines", sash: "PH", portraitUrl: "/assets/candidates/candidate_philippines_portrait_silver-gown.webp" },
      { name: "Mai Tanaka", country: "Japan", sash: "JP", portraitUrl: "/assets/candidates/candidate_japan_portrait_yellow-gown.webp" },
      { name: "Linh Nguyen", country: "Vietnam", sash: "VN", portraitUrl: "/assets/candidates/candidate_vietnam_portrait_silver-gown.webp" },
      { name: "Priya Sharma", country: "India", sash: "IN", portraitUrl: "/assets/candidates/candidate_india_portrait_gold-gown_stage.webp" },
      { name: "Aisyah Putri", country: "Indonesia", sash: "ID", portraitUrl: "/assets/candidates/candidate_indonesia_portrait_gold-gown.webp" },
      { name: "Siti Aminah", country: "Malaysia", sash: "MY", portraitUrl: "/assets/candidates/candidate_malaysia_portrait_gold-gown.webp" },
      { name: "Chloe Tan", country: "Singapore", sash: "SG", portraitUrl: "/assets/candidates/candidate_singapore_portrait_silver-gown.webp" },
      { name: "Min-Ji Kim", country: "South Korea", sash: "KR", portraitUrl: "/assets/candidates/candidate_south-korea_portrait_yellow-gown.webp" },
      { name: "Chayanit Fahsai", country: "Thailand", sash: "TH", portraitUrl: "/assets/candidates/candidate_thailand_portrait_silver-gown_profile.webp" },
      { name: "Mei-Ling Chen", country: "China", sash: "CN", portraitUrl: "/assets/candidates/candidate_china_portrait_yellow-gown_outdoor.webp" },
    ].map((c) => db.contestant.create({ data: c }))
  );

  await db.votingRound.create({ data: { title: "People's Choice - Preliminary" } });

  for (const c of contestants) {
    await db.collectible.create({
      data: {
        contestantId: c.id,
        title: `${c.name} - Official Portrait`,
        metadataUri: `ipfs://demo/${c.sash.toLowerCase()}.json`,
        priceUsdc: 25,
        edition: 1,
      },
    });
  }
  console.log("Seeded 10 contestants, a round, and collectibles.");
}

main().finally(() => db.$disconnect());
