import { createHash } from "crypto";

// Deterministic SHA-256 Merkle tree used to anchor a voting round.
// Leaves are the per-vote hashes; the root is anchored on Stellar, and any voter
// can be given an inclusion proof (a receipt) that verifies against the published root
// without revealing any other voter's identity.

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

// Leaf commitment for a single vote. Kept minimal and PII-free once hashed.
export function voteLeaf(fanId: string, contestantId: string, roundId: string): string {
  return sha256Hex(`${fanId}|${contestantId}|${roundId}`);
}

function hashPair(a: string, b: string): string {
  // Sort so proof verification is order-independent.
  const [x, y] = a <= b ? [a, b] : [b, a];
  return sha256Hex(x + y);
}

export interface ProofStep {
  sibling: string;
}

// Build the tree and return the root. Duplicates the last node on odd levels.
export function merkleRoot(leaves: string[]): string {
  if (leaves.length === 0) return sha256Hex("empty");
  let level = [...leaves];
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = i + 1 < level.length ? level[i + 1] : level[i];
      next.push(hashPair(left, right));
    }
    level = next;
  }
  return level[0];
}

// Produce an inclusion proof for the leaf at `index`.
export function merkleProof(leaves: string[], index: number): ProofStep[] {
  if (index < 0 || index >= leaves.length) throw new Error("leaf index out of range");
  const proof: ProofStep[] = [];
  let idx = index;
  let level = [...leaves];
  while (level.length > 1) {
    const isRight = idx % 2 === 1;
    const siblingIdx = isRight ? idx - 1 : idx + 1;
    const sibling = siblingIdx < level.length ? level[siblingIdx] : level[idx];
    proof.push({ sibling });
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = i + 1 < level.length ? level[i + 1] : level[i];
      next.push(hashPair(left, right));
    }
    level = next;
    idx = Math.floor(idx / 2);
  }
  return proof;
}

// Verify a leaf against a published root using its proof.
export function verifyProof(leaf: string, proof: ProofStep[], root: string): boolean {
  let acc = leaf;
  for (const step of proof) acc = hashPair(acc, step.sibling);
  return acc === root;
}
