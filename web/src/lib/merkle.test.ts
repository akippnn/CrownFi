// Minimal self-check for the Merkle voting proof. Run: npm run test:merkle
import { voteLeaf, merkleRoot, merkleProof, verifyProof } from "./merkle";

function assert(cond: boolean, label: string) {
  if (!cond) { console.error("FAIL:", label); process.exit(1); }
  console.log("ok:", label);
}

const round = "round_1";
const leaves = ["fanA", "fanB", "fanC", "fanD", "fanE"].map((f, i) =>
  voteLeaf(f, i % 2 === 0 ? "contestant_1" : "contestant_2", round)
);

const root = merkleRoot(leaves);
assert(typeof root === "string" && root.length === 64, "root is a 32-byte hex");

for (let i = 0; i < leaves.length; i++) {
  const proof = merkleProof(leaves, i);
  assert(verifyProof(leaves[i], proof, root), `proof verifies for leaf ${i}`);
}

// A forged leaf must not verify against a real proof.
const forged = voteLeaf("attacker", "contestant_1", round);
assert(!verifyProof(forged, merkleProof(leaves, 0), root), "forged leaf rejected");

console.log("\nAll Merkle checks passed.");
