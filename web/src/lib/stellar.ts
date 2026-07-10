import { createHash, randomBytes } from "crypto";

// Stellar service boundary.
//
// STELLAR_MODE=mock (default) returns simulated tx hashes / token ids so the whole app runs
// offline with no network or keys.
//
// STELLAR_MODE=live submits REAL Soroban transactions against the deployed contracts, signed
// server-side by the platform account (STELLAR_PLATFORM_SECRET). The platform account must be:
//   - the ADMIN of the audit-anchor contract (it calls publish), and
//   - the OWNER of the ticket + collectible contracts (it calls mint).
// The deploy script (contracts/scripts/deploy.sh) sets admin/owner to the deployer identity, so
// STELLAR_PLATFORM_SECRET must be the secret key of that same identity. See DEPLOY.md.
//
// Note on collectible purchases: on-chain we currently mint the collectible NFT to the fan
// (owner-signed). The USDC payment split via the sale-splitter needs the BUYER to sign in their
// own wallet (Freighter), which is a client-side signing flow left as future work — see stellar.ts
// TODO below. Everything else is fully live.

const MODE = process.env.STELLAR_MODE ?? "mock";

function fakeTxHash(seed: string): string {
  return createHash("sha256").update(seed + randomBytes(6).toString("hex")).digest("hex");
}

function fakeTokenId(): string {
  return randomBytes(8).toString("hex");
}

// Map the app's string round id (a cuid) to the u32 the audit-anchor contract expects.
// Deterministic per round: the first 4 bytes of sha256(roundId).
function roundIdToU32(roundId: string): number {
  const hex = createHash("sha256").update(roundId).digest("hex").slice(0, 8);
  return parseInt(hex, 16) >>> 0; // unsigned 32-bit
}

// ---------------------------------------------------------------------------
// Live invocation helper
// ---------------------------------------------------------------------------

const FALLBACKS: Record<string, string> = {
  AUDIT_ANCHOR_CONTRACT_ID: "CAC7AX3PFJ5NC43BB5TRWY4QTKLSPBVK3DT5GTLH5N6Y3TIYK5GLOVNV",
  TICKET_CONTRACT_ID: "CA7M6UH55Z4UBQKBZNZBFFU3PWI3XI3BH46LMHSUINWJHTRG7CYDLH6N",
  COLLECTIBLE_CONTRACT_ID: "CAZOOO3AUNGKDE6XTQNHETSBJGU33I2OCNREZ63GTUTDRPYBUS2R4LZX",
  SALE_SPLITTER_CONTRACT_ID: "CATCOIVWAVVXBNLPOXBVN3WQ26UNAVLUVSRYBNQWIII75I5QK4YV2KU3",
  USDC_TEST_CONTRACT_ID: "CAE2GXXU4BPLRX5DHLFJKUR7AP5ETPIERGTFNCY7PEFCEL5H3G3RG6LW",
  DEMO_CONTESTANT_PAYOUT: "GCK4VGS6VXHJCUZV3U4ACMKS77NYRWXITTFE6PW5P2DRJV6B7GN34S2J",
  EVENT_TREASURY_PAYOUT: "GC3PXGAWQWHHV6M6AKR3LSZZ7RNYZXASGNJM7BSU3EMWI5KG2R5QSIY3",
};

function requireEnv(name: string): string {
  const v = process.env[name] || FALLBACKS[name];
  if (!v) throw new Error(`${name} is required. Set it in web/.env (see DEPLOY.md).`);
  return v;
}

function networkPassphrase(Networks: any): string {
  const net = (process.env.STELLAR_NETWORK ?? "testnet").toLowerCase();
  return net === "public" || net === "mainnet" ? Networks.PUBLIC : Networks.TESTNET;
}

// Build, prepare, sign, submit a single contract call and (optionally) return its native result.
// Returns the transaction hash and the decoded return value.
async function invoke(
  contractId: string,
  method: string,
  buildArgs: (sdk: any) => any[]
): Promise<{ txHash: string; returnValue: any }> {
  const sdk: any = await import("@stellar/stellar-sdk");
  const { Contract, TransactionBuilder, Keypair, BASE_FEE, Networks, rpc } = sdk;

  const rpcUrl = process.env.STELLAR_RPC_URL ?? "https://soroban-testnet.stellar.org";
  const secret = requireEnv("STELLAR_PLATFORM_SECRET");
  const passphrase = networkPassphrase(Networks);

  const server = new rpc.Server(rpcUrl, { allowHttp: rpcUrl.startsWith("http://") });
  const keypair = Keypair.fromSecret(secret);
  const source = await server.getAccount(keypair.publicKey());

  const contract = new Contract(contractId);
  const op = contract.call(method, ...buildArgs(sdk));

  let tx = new TransactionBuilder(source, { fee: BASE_FEE, networkPassphrase: passphrase })
    .addOperation(op)
    .setTimeout(30)
    .build();

  // Simulate + assemble the Soroban footprint, auth, and resource fees.
  tx = await server.prepareTransaction(tx);
  tx.sign(keypair);

  const sent = await server.sendTransaction(tx);
  if (sent.status === "ERROR") {
    throw new Error(`submit failed: ${JSON.stringify(sent.errorResult ?? sent)}`);
  }

  // Poll until the network confirms (or fails) the transaction.
  let got = await server.getTransaction(sent.hash);
  for (let i = 0; i < 30 && got.status === rpc.Api.GetTransactionStatus.NOT_FOUND; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    got = await server.getTransaction(sent.hash);
  }
  if (got.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
    throw new Error(`tx ${sent.hash} did not succeed: ${got.status}`);
  }

  let returnValue: any = undefined;
  try {
    if (got.returnValue) returnValue = sdk.scValToNative(got.returnValue);
  } catch {
    /* no decodable return value */
  }
  return { txHash: sent.hash, returnValue };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface AnchorResult {
  txHash: string;
  mode: string;
}

// Publish a voting round's Merkle root + tally hash to the audit-anchor contract.
export async function anchorCheckpoint(params: {
  roundId: string;
  merkleRoot: string; // 32-byte hex
  tallyHash: string; // 32-byte hex
  totalVotes: number;
}): Promise<AnchorResult> {
  if (MODE === "live") {
    const contractId = requireEnv("AUDIT_ANCHOR_CONTRACT_ID");
    const { txHash } = await invoke(contractId, "publish", (sdk) => [
      sdk.nativeToScVal(roundIdToU32(params.roundId), { type: "u32" }),
      sdk.nativeToScVal(Buffer.from(params.merkleRoot, "hex"), { type: "bytes" }),
      sdk.nativeToScVal(Buffer.from(params.tallyHash, "hex"), { type: "bytes" }),
      sdk.nativeToScVal(params.totalVotes, { type: "u32" }),
    ]);
    return { txHash, mode: "live" };
  }
  return { txHash: fakeTxHash(`anchor:${params.roundId}:${params.merkleRoot}`), mode: "mock" };
}

export interface MintResult {
  tokenId: string;
  txHash: string;
  mode: string;
}

// Mint an NFT ticket to a fan's wallet. Owner-signed (platform account).
export async function mintTicket(params: {
  toAddress: string;
  eventName: string;
  tier: string;
  seat: string;
}): Promise<MintResult> {
  if (MODE === "live") {
    const contractId = requireEnv("TICKET_CONTRACT_ID");
    const { txHash, returnValue } = await invoke(contractId, "mint", (sdk) => [
      new sdk.Address(params.toAddress).toScVal(),
    ]);
    return { tokenId: String(returnValue ?? ""), txHash, mode: "live" };
  }
  return { tokenId: fakeTokenId(), txHash: fakeTxHash(`ticket:${params.seat}`), mode: "mock" };
}

// Mint the collectible NFT to the fan (owner-signed by the platform). Called AFTER the buyer has
// paid via the sale-splitter (see the prepare/confirm buy flow below).
export async function mintCollectible(params: {
  toAddress: string;
  metadataUri: string;
}): Promise<MintResult> {
  if (MODE === "live") {
    const contractId = requireEnv("COLLECTIBLE_CONTRACT_ID");
    const { txHash, returnValue } = await invoke(contractId, "mint", (sdk) => [
      new sdk.Address(params.toAddress).toScVal(),
    ]);
    return { tokenId: String(returnValue ?? ""), txHash, mode: "live" };
  }
  return { tokenId: fakeTokenId(), txHash: fakeTxHash(`collectible:${params.metadataUri}`), mode: "mock" };
}

// Kept for backward compatibility (the non-USDC path): mints the collectible without payment.
export const buyCollectible = mintCollectible;

// ---------------------------------------------------------------------------
// USDC payment via the sale-splitter (buyer-signed in Freighter)
// ---------------------------------------------------------------------------

export const USDC_DECIMALS = 7;
export function usdcToBaseUnits(usdc: number): number {
  return Math.round(usdc * 10 ** USDC_DECIMALS);
}

async function server() {
  const sdk: any = await import("@stellar/stellar-sdk");
  const rpcUrl = process.env.STELLAR_RPC_URL ?? "https://soroban-testnet.stellar.org";
  const srv = new sdk.rpc.Server(rpcUrl, { allowHttp: rpcUrl.startsWith("http://") });
  return { sdk, srv, passphrase: networkPassphrase(sdk.Networks) };
}

// Faucet: mint test USDC to a wallet so it can buy. Owner-signed (platform = token owner).
export async function mintTestUsdc(params: { toAddress: string; amountUsdc: number }): Promise<{ txHash: string; mode: string }> {
  if (MODE !== "live") return { txHash: fakeTxHash(`faucet:${params.toAddress}`), mode: "mock" };
  const contractId = requireEnv("USDC_TEST_CONTRACT_ID");
  const { txHash } = await invoke(contractId, "mint", (sdk) => [
    new sdk.Address(params.toAddress).toScVal(),
    sdk.nativeToScVal(usdcToBaseUnits(params.amountUsdc), { type: "i128" }),
  ]);
  return { txHash, mode: "live" };
}

// Admin: register a sale-splitter listing (price + contestant payee). Admin-signed (platform).
export async function setListing(params: { listingId: number; priceUsdc: number; contestantAddress: string }): Promise<{ txHash: string }> {
  const contractId = requireEnv("SALE_SPLITTER_CONTRACT_ID");
  const { txHash } = await invoke(contractId, "set_listing", (sdk) => [
    sdk.nativeToScVal(params.listingId, { type: "u32" }),
    sdk.nativeToScVal(usdcToBaseUnits(params.priceUsdc), { type: "i128" }),
    new sdk.Address(params.contestantAddress).toScVal(),
    sdk.nativeToScVal(true, { type: "bool" }),
  ]);
  return { txHash };
}

// Read a wallet's test-USDC balance (read-only simulation, no signing/fee).
export async function readUsdcBalance(address: string): Promise<number> {
  if (!address || !address.startsWith("G")) return 0;
  try {
    const { sdk, srv } = await server();
    const contractId = requireEnv("USDC_TEST_CONTRACT_ID");
    const secret = process.env.STELLAR_PLATFORM_SECRET;
    let sourcePub: string;
    if (secret) {
      sourcePub = sdk.Keypair.fromSecret(secret).publicKey();
    } else {
      sourcePub = address;
    }
    const src = await srv.getAccount(sourcePub).catch(() => {
      return new sdk.Account(sourcePub, "0");
    });
    const contract = new sdk.Contract(contractId);
    const tx = new sdk.TransactionBuilder(src, { fee: sdk.BASE_FEE, networkPassphrase: networkPassphrase(sdk.Networks) })
      .addOperation(contract.call("balance", new sdk.Address(address).toScVal()))
      .setTimeout(30)
      .build();
    const sim = await srv.simulateTransaction(tx);
    if (sdk.rpc.Api.isSimulationError(sim) || !sim.result) return 0;
    const raw = sdk.scValToNative(sim.result.retval) as bigint | number;
    return Number(raw) / 10 ** USDC_DECIMALS;
  } catch (e) {
    console.error("[readUsdcBalance] read failed:", e);
    return 0;
  }
}

// Read a wallet's native XLM balance (read-only from Horizon).
export async function readXlmBalance(address: string): Promise<number> {
  if (!address || !address.startsWith("G")) return 0;
  try {
    const horizonUrl = "https://horizon-testnet.stellar.org";
    const res = await fetch(`${horizonUrl}/accounts/${address}`);
    if (res.ok) {
      const data = await res.json();
      const nativeBalance = data.balances.find((b: any) => b.asset_type === "native")?.balance;
      return Number(nativeBalance ?? 0);
    }
  } catch (e) {
    console.error("[readXlmBalance] read failed:", e);
  }
  return 0;
}

// Build an UNSIGNED transaction for the buyer to pay with XLM.
// Splits the payment 95/5 directly on-chain between the payee and platform treasury.
export async function buildXlmBuyTx(params: {
  buyerAddress: string;
  priceXlm: number;
  payeeAddress: string;
}): Promise<{ xdr: string; txHash: string }> {
  const { sdk, srv, passphrase } = await server();
  const source = await srv.getAccount(params.buyerAddress);
  
  const platformAddress = requireEnv("DEMO_CONTESTANT_PAYOUT");
  const feeBps = 500; // 5% fee (platform cut)
  const feeAmount = (params.priceXlm * feeBps) / 10000;
  const toPayee = params.priceXlm - feeAmount;

  const tx = new sdk.TransactionBuilder(source, { fee: sdk.BASE_FEE, networkPassphrase: passphrase })
    .addOperation(
      sdk.Operation.payment({
        destination: params.payeeAddress,
        asset: sdk.Asset.native(),
        amount: toPayee.toFixed(7),
      })
    )
    .addOperation(
      sdk.Operation.payment({
        destination: platformAddress,
        asset: sdk.Asset.native(),
        amount: feeAmount.toFixed(7),
      })
    )
    .setTimeout(180)
    .build();

  const prepared = await srv.prepareTransaction(tx);
  return { xdr: prepared.toXDR(), txHash: Buffer.from(prepared.hash()).toString("hex") };
}

// STEP 1 of a purchase: build an UNSIGNED transaction for the buyer to approve in Freighter.
// The buyer is the transaction SOURCE, so their single Freighter signature authorizes both the
// buy() call and the USDC transfers it makes (source-account auth). Returns the tx XDR.
export async function buildBuyTx(params: { buyerAddress: string; listingId: number }): Promise<{ xdr: string; txHash: string }> {
  const { sdk, srv, passphrase } = await server();
  const contractId = requireEnv("SALE_SPLITTER_CONTRACT_ID");
  const source = await srv.getAccount(params.buyerAddress); // buyer pays the fee + authorizes
  const contract = new sdk.Contract(contractId);
  const op = contract.call(
    "buy",
    new sdk.Address(params.buyerAddress).toScVal(),
    sdk.nativeToScVal(params.listingId, { type: "u32" })
  );
  let tx = new sdk.TransactionBuilder(source, { fee: sdk.BASE_FEE, networkPassphrase: passphrase })
    .addOperation(op)
    .setTimeout(180)
    .build();
  tx = await srv.prepareTransaction(tx); // simulate + assemble footprint/auth
  return { xdr: tx.toXDR(), txHash: Buffer.from(tx.hash()).toString("hex") };
}

// Build an UNSIGNED AuditAnchor.publish() tx for the ADMIN to sign in Freighter.
// The admin is the tx source, so their signature satisfies publish()'s require_auth(admin).
// NOTE: the connected admin wallet must be the audit-anchor contract's admin (set at deploy).
export async function buildAnchorTx(params: {
  adminAddress: string;
  roundId: string;
  merkleRoot: string;
  tallyHash: string;
  totalVotes: number;
}): Promise<{ xdr: string; txHash: string }> {
  const { sdk, srv, passphrase } = await server();
  const contractId = requireEnv("AUDIT_ANCHOR_CONTRACT_ID");
  const source = await srv.getAccount(params.adminAddress);
  const contract = new sdk.Contract(contractId);
  const op = contract.call(
    "publish",
    sdk.nativeToScVal(roundIdToU32(params.roundId), { type: "u32" }),
    sdk.nativeToScVal(Buffer.from(params.merkleRoot, "hex"), { type: "bytes" }),
    sdk.nativeToScVal(Buffer.from(params.tallyHash, "hex"), { type: "bytes" }),
    sdk.nativeToScVal(params.totalVotes, { type: "u32" })
  );
  let tx = new sdk.TransactionBuilder(source, { fee: sdk.BASE_FEE, networkPassphrase: passphrase })
    .addOperation(op)
    .setTimeout(180)
    .build();
  tx = await srv.prepareTransaction(tx);
  return { xdr: tx.toXDR(), txHash: Buffer.from(tx.hash()).toString("hex") };
}

// STEP 2 of a purchase (or admin anchor): submit the Freighter-signed XDR and wait for confirmation.
export async function submitSignedXdr(
  signedXdr: string,
  expected?: { source?: string; txHash?: string }
): Promise<{ txHash: string }> {
  const { sdk, srv, passphrase } = await server();
  const tx = sdk.TransactionBuilder.fromXDR(signedXdr, passphrase);
  const source = String((tx as any).source ?? "");
  const bodyHash = Buffer.from(tx.hash()).toString("hex");
  if (expected?.source && source !== expected.source) throw new Error("signed transaction source mismatch");
  if (expected?.txHash && bodyHash !== expected.txHash) throw new Error("signed transaction does not match prepared CrownFi intent");
  const sent = await srv.sendTransaction(tx);
  if (sent.status === "ERROR") throw new Error(`submit failed: ${JSON.stringify(sent.errorResult ?? sent)}`);
  let got = await srv.getTransaction(sent.hash);
  for (let i = 0; i < 30 && got.status === sdk.rpc.Api.GetTransactionStatus.NOT_FOUND; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    got = await srv.getTransaction(sent.hash);
  }
  if (got.status !== sdk.rpc.Api.GetTransactionStatus.SUCCESS) {
    throw new Error(`tx ${sent.hash} did not succeed: ${got.status}`);
  }
  return { txHash: sent.hash };
}
