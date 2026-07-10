// Public Stellar Expert links for Testnet transaction receipts. Keeping this in
// one place makes it impossible for the UI to accidentally point demo hashes at
// the public network.
export function testnetTransactionUrl(txHash: string): string | null {
  const hash = txHash.trim();
  return /^[a-fA-F0-9]{64}$/.test(hash)
    ? `https://stellar.expert/explorer/testnet/tx/${hash}`
    : null;
}
