import { type CKBTransaction } from "@joyid/ckb";
import { addressToScript, scriptOccupied, scriptToHash, serializeWitnessArgs } from "@nervosnetwork/ckb-sdk-utils";
import {
  broadcastCkbTransaction,
  ckbNetwork,
  ckbRpcURL,
  dryRunCkbTransaction,
  showJoyIdPopupStatus,
  signRawCkbTransaction,
  type ConnectedCkbWallet,
  type JoyIdPopup,
} from "@/lib/ckbWallet";

const SHANNONS_PER_CKB = BigInt(100_000_000);
const MAX_COLLECTION_ROUNDS = 10;
const VAULT_DATA_LEN = 33;
const RECEIPT_DATA_LEN = 41;
const FEE_CLAIM_DATA_LEN = 10;
const FEE_MARGIN = BigInt(2) * SHANNONS_PER_CKB;
const CELL_CAPACITY_PAD = BigInt(2) * SHANNONS_PER_CKB;
const JOYID_CELL_DEP_TX_HASH = process.env.NEXT_PUBLIC_JOYID_CELL_DEP_TX_HASH;
const JOYID_CELL_DEP_INDEX = process.env.NEXT_PUBLIC_JOYID_CELL_DEP_INDEX ?? "0x0";
const JOYID_CELL_DEP_TYPE = process.env.NEXT_PUBLIC_JOYID_CELL_DEP_TYPE;
const TESTNET_JOYID_DEP_GROUP: CellDep = {
  outPoint: {
    txHash: "0x759f281588c96979764cb21c196478cf8e13ea81fede7f4ba26d1ff29dbc6a81",
    index: "0x0",
  },
  depType: "depGroup",
};

type HashType = "type" | "data" | "data1";
type CellDep = CKBTransaction["cellDeps"][number];
type JoyScript = { codeHash: string; hashType: HashType; args: string };
type RpcScript = { code_hash: string; hash_type: HashType; args: string };
type OutPoint = { txHash: string; index: string };
type TxInput = { previousOutput: OutPoint; since: string };

type VaultScripts = {
  vault_lock_code_hash: string | null;
  vault_lock_out_point: string | null;
  vault_type_code_hash: string | null;
  vault_type_out_point: string | null;
  lp_receipt_type_code_hash: string | null;
  lp_receipt_type_out_point: string | null;
  request_type_code_hash: string | null;
  request_type_out_point: string | null;
  fee_claim_type_code_hash: string | null;
  fee_claim_type_out_point: string | null;
};

type VaultConfig = {
  asset: string;
  address: string | null;
  cell_out_point?: string | null;
  scripts?: VaultScripts;
};

type LpPosition = {
  id: string;
  ckb_address: string;
  asset: string;
  supplied_amount: number;
  available_amount: number;
  reserved_amount: number;
  deployed_amount: number;
  fees_earned: number;
  fees_claimed: number;
  receipt_cell_out_point?: string | null;
  supply_tx_hash: string;
};

type WithdrawalIntent = { id: string; amount: number };
type FeeClaimIntent = { id: string; amount: number };

type RpcCell = {
  output: { capacity: string; lock: RpcScript; type?: RpcScript | null };
  data?: { content: string } | null;
};

type RpcLiveCell = RpcCell & {
  output_data?: string;
  out_point: { tx_hash: string; index: string };
};

type GetCellsResponse = { objects: RpcLiveCell[]; last_cursor: string };
type GetLiveCellResponse = { cell: RpcCell | null; status: "live" | "dead" | "unknown" };
type FundingCell = TxInput & { capacity: bigint };
type VaultCell = { input: TxInput; capacity: bigint; lock: JoyScript; type: JoyScript; data: VaultData };
type ReceiptCell = { input: TxInput; capacity: bigint; lock: JoyScript; type: JoyScript; data: ReceiptData };
type VaultData = { total: bigint; reserved: bigint; deployed: bigint; feeBalance: bigint };
type ReceiptData = { supplied: bigint; available: bigint; reserved: bigint; deployed: bigint; claimed: bigint };

export type SettlementProgressStep = "vault" | "receipt" | "funding" | "signing" | "verify" | "broadcast";
export type SettlementResult = { tx: CKBTransaction; txHash: string; receiptCellOutPoint: string | null };

export async function withdrawVaultLiquidity(
  wallet: ConnectedCkbWallet,
  options: {
    vault: VaultConfig;
    position: LpPosition;
    intent: WithdrawalIntent;
    amount: number;
    onProgress?: (step: SettlementProgressStep, message: string) => void;
  },
  popup?: JoyIdPopup,
): Promise<SettlementResult> {
  const amount = ckbAmount(options.amount);
  const scripts = requiredScripts(options.vault.scripts);
  const userLock = toJoyScript(addressToScript(wallet.ckbAddress));
  reportProgress(options, popup, "vault", "Loading the active vault cell.");
  const vaultCell = await loadVaultCell(options.vault, scripts);
  reportProgress(options, popup, "receipt", "Loading your LP receipt cell.");
  const receiptCell = await loadReceiptCell(options.position, userLock, scripts);
  if (amount.units > receiptCell.data.available) throw new Error("Withdrawal exceeds available LP receipt balance.");

  const payoutCapacity = amount.shannons;
  const hasReceiptOutput = amount.units < receiptCell.data.supplied;
  const minChangeCapacity = occupiedCapacity(userLock, null, 0) + CELL_CAPACITY_PAD;
  const requiredFunding = minChangeCapacity + FEE_MARGIN;
  reportProgress(options, popup, "funding", "Selecting a JoyID cell to pay network fees.");
  const funding = selectFunding(await collectFundingCells(userLock), requiredFunding);
  const unsignedTx = buildWithdrawalTx({ amount, funding, userLock, vaultCell, receiptCell, payoutCapacity, hasReceiptOutput, minChangeCapacity, scripts });
  const joyIdWitnessIndexes = settlementJoyIdWitnessIndexes(funding.inputs.length);
  reportProgress(options, popup, "signing", "Review the withdrawal in JoyID and confirm.");
  const signedTx = await signRawCkbTransaction(wallet, unsignedTx, joyIdWitnessIndexes, popup);
  assertJoyIdSignedWitness(unsignedTx, signedTx, joyIdWitnessIndexes);
  reportProgress(options, popup, "verify", "Dry-running the withdrawal before broadcast.");
  await dryRunCkbTransaction(signedTx);
  reportProgress(options, popup, "broadcast", "Broadcasting the verified withdrawal.");
  const txHash = await broadcastCkbTransaction(signedTx);
  return { tx: { ...signedTx, hash: txHash }, txHash, receiptCellOutPoint: hasReceiptOutput ? `${txHash}#0x1` : null };
}

export async function claimVaultFees(
  wallet: ConnectedCkbWallet,
  options: {
    vault: VaultConfig;
    position: LpPosition;
    claim: FeeClaimIntent;
    amount: number;
    onProgress?: (step: SettlementProgressStep, message: string) => void;
  },
  popup?: JoyIdPopup,
): Promise<SettlementResult> {
  const amount = ckbAmount(options.amount);
  const scripts = requiredScripts(options.vault.scripts);
  const userLock = toJoyScript(addressToScript(wallet.ckbAddress));
  reportProgress(options, popup, "vault", "Loading the active vault fee balance.");
  const vaultCell = await loadVaultCell(options.vault, scripts);
  if (amount.units > vaultCell.data.feeBalance) throw new Error("Vault fee balance is lower than this claim amount.");
  reportProgress(options, popup, "receipt", "Loading your LP receipt cell.");
  const receiptCell = await loadReceiptCell(options.position, userLock, scripts);
  const claimType = buildFeeClaimType(userLock, vaultCell.type, receiptCell.type, scripts, options.claim.id);
  const claimCapacity = occupiedCapacity(userLock, claimType, FEE_CLAIM_DATA_LEN) + CELL_CAPACITY_PAD;
  const minChangeCapacity = occupiedCapacity(userLock, null, 0) + CELL_CAPACITY_PAD;
  const requiredFunding = claimCapacity + minChangeCapacity + FEE_MARGIN;
  reportProgress(options, popup, "funding", "Selecting a JoyID cell to create the fee claim receipt.");
  const funding = selectFunding(await collectFundingCells(userLock), requiredFunding);
  const unsignedTx = buildFeeClaimTx({ amount, funding, userLock, vaultCell, receiptCell, claimType, claimCapacity, minChangeCapacity, scripts });
  const joyIdWitnessIndexes = settlementJoyIdWitnessIndexes(funding.inputs.length);
  reportProgress(options, popup, "signing", "Review the fee claim in JoyID and confirm.");
  const signedTx = await signRawCkbTransaction(wallet, unsignedTx, joyIdWitnessIndexes, popup);
  assertJoyIdSignedWitness(unsignedTx, signedTx, joyIdWitnessIndexes);
  reportProgress(options, popup, "verify", "Dry-running the fee claim before broadcast.");
  await dryRunCkbTransaction(signedTx);
  reportProgress(options, popup, "broadcast", "Broadcasting the verified fee claim.");
  const txHash = await broadcastCkbTransaction(signedTx);
  return { tx: { ...signedTx, hash: txHash }, txHash, receiptCellOutPoint: `${txHash}#0x1` };
}

function buildWithdrawalTx(input: {
  amount: { units: bigint; shannons: bigint };
  funding: { inputs: TxInput[]; total: bigint };
  userLock: JoyScript;
  vaultCell: VaultCell;
  receiptCell: ReceiptCell;
  payoutCapacity: bigint;
  hasReceiptOutput: boolean;
  minChangeCapacity: bigint;
  scripts: RequiredScripts;
}): CKBTransaction {
  const spendCapacity = FEE_MARGIN;
  const changeCapacity = input.funding.total - spendCapacity;
  if (changeCapacity < input.minChangeCapacity) throw new Error("Funding cell does not leave enough change after withdrawal fees.");
  const outputs: CKBTransaction["outputs"] = [vaultOutput(input.vaultCell, input.vaultCell.capacity - input.amount.shannons)];
  const outputsData = [vaultDataHex({ ...input.vaultCell.data, total: input.vaultCell.data.total - input.amount.units })];
  if (input.hasReceiptOutput) {
    outputs.push({ capacity: toHex(input.receiptCell.capacity), lock: input.userLock, type: input.receiptCell.type });
    outputsData.push(receiptDataHex({ ...input.receiptCell.data, supplied: input.receiptCell.data.supplied - input.amount.units, available: input.receiptCell.data.available - input.amount.units }));
  }
  outputs.push({ capacity: toHex(input.payoutCapacity), lock: input.userLock }, { capacity: toHex(changeCapacity), lock: input.userLock });
  outputsData.push("0x", "0x");
  return baseTx(input.scripts, input.funding.inputs, input.receiptCell.input, input.vaultCell.input, outputs, outputsData);
}

function buildFeeClaimTx(input: {
  amount: { units: bigint; shannons: bigint };
  funding: { inputs: TxInput[]; total: bigint };
  userLock: JoyScript;
  vaultCell: VaultCell;
  receiptCell: ReceiptCell;
  claimType: JoyScript;
  claimCapacity: bigint;
  minChangeCapacity: bigint;
  scripts: RequiredScripts;
}): CKBTransaction {
  const changeCapacity = input.funding.total - input.claimCapacity - FEE_MARGIN;
  if (changeCapacity < input.minChangeCapacity) throw new Error("Funding cell does not leave enough change after fee claim costs.");
  return baseTx(input.scripts, input.funding.inputs, input.receiptCell.input, input.vaultCell.input, [
    vaultOutput(input.vaultCell, input.vaultCell.capacity - input.amount.shannons),
    {
      capacity: toHex(input.receiptCell.capacity),
      lock: input.userLock,
      type: input.receiptCell.type,
    },
    { capacity: toHex(input.claimCapacity), lock: input.userLock, type: input.claimType },
    { capacity: toHex(input.amount.shannons), lock: input.userLock },
    { capacity: toHex(changeCapacity), lock: input.userLock },
  ], [
    vaultDataHex({ ...input.vaultCell.data, feeBalance: input.vaultCell.data.feeBalance - input.amount.units }),
    receiptDataHex({ ...input.receiptCell.data, claimed: input.receiptCell.data.claimed + input.amount.units }),
    feeClaimDataHex(1, input.amount.units),
    "0x",
    "0x",
  ]);
}

function baseTx(
  scripts: RequiredScripts,
  fundingInputs: TxInput[],
  receiptInput: TxInput,
  vaultInput: TxInput,
  outputs: CKBTransaction["outputs"],
  outputsData: string[],
): CKBTransaction {
  return {
    version: "0x0",
    cellDeps: [
      ...configuredJoyIdCellDep(),
      codeDep(scripts.vault_lock_out_point),
      codeDep(scripts.vault_type_out_point),
      codeDep(scripts.lp_receipt_type_out_point),
      codeDep(scripts.fee_claim_type_out_point),
    ],
    headerDeps: [],
    inputs: [...fundingInputs, receiptInput, vaultInput],
    outputs,
    outputsData,
    witnesses: [emptyWitness(), ...fundingInputs.slice(1).map(() => "0x"), "0x", "0x"],
  };
}

function settlementJoyIdWitnessIndexes(fundingInputCount: number) {
  return Array.from({ length: fundingInputCount + 1 }, (_, index) => index);
}

function vaultOutput(cell: VaultCell, capacity: bigint) {
  return { capacity: toHex(capacity), lock: cell.lock, type: cell.type };
}

async function loadVaultCell(vault: VaultConfig, scripts: RequiredScripts): Promise<VaultCell> {
  const outPoint = parseOutPoint(vault.cell_out_point);
  const result = await callCkbRpc<GetLiveCellResponse>("get_live_cell", [{ tx_hash: outPoint.txHash, index: outPoint.index }, true]);
  if (result.status !== "live" || !result.cell) throw new Error(`Configured vault cell is ${result.status}. Refresh Core deployment config.`);
  const type = result.cell.output.type ? toJoyScript(result.cell.output.type) : null;
  if (!type || normalizeHash(type.codeHash) !== normalizeHash(scripts.vault_type_code_hash)) throw new Error("Configured vault cell does not use the active LiquidLane vault type script.");
  return { input: { previousOutput: outPoint, since: "0x0" }, capacity: BigInt(result.cell.output.capacity), lock: toJoyScript(result.cell.output.lock), type, data: parseVaultData(result.cell.data?.content ?? "0x") };
}

async function loadReceiptCell(position: LpPosition, userLock: JoyScript, scripts: RequiredScripts): Promise<ReceiptCell> {
  const outPoint = parseOutPoint(position.receipt_cell_out_point ?? `${position.supply_tx_hash}#0x1`);
  const result = await callCkbRpc<GetLiveCellResponse>("get_live_cell", [{ tx_hash: outPoint.txHash, index: outPoint.index }, true]);
  if (result.status !== "live" || !result.cell) throw new Error(`LP receipt cell is ${result.status}. Sync Core and retry.`);
  const type = result.cell.output.type ? toJoyScript(result.cell.output.type) : null;
  if (!type || normalizeHash(type.codeHash) !== normalizeHash(scripts.lp_receipt_type_code_hash)) throw new Error("LP receipt cell does not use the active LiquidLane receipt script.");
  const lock = toJoyScript(result.cell.output.lock);
  if (!sameScript(lock, userLock)) throw new Error("LP receipt cell is not locked to the connected wallet.");
  return { input: { previousOutput: outPoint, since: "0x0" }, capacity: BigInt(result.cell.output.capacity), lock, type, data: parseReceiptData(result.cell.data?.content ?? "0x") };
}

async function collectFundingCells(lock: JoyScript): Promise<FundingCell[]> {
  const cells: FundingCell[] = [];
  let cursor: string | null = null;
  for (let round = 0; round < MAX_COLLECTION_ROUNDS; round += 1) {
    const result: GetCellsResponse = await callCkbRpc<GetCellsResponse>("get_cells", getCellsParams(lock, cursor));
    for (const cell of result.objects) {
      if (cell.output.type) continue;
      if ((cell.output_data ?? "0x") !== "0x") continue;
      cells.push({ previousOutput: { txHash: cell.out_point.tx_hash, index: cell.out_point.index }, since: "0x0", capacity: BigInt(cell.output.capacity) });
    }
    if (!result.last_cursor || result.last_cursor === cursor || result.objects.length === 0) break;
    cursor = result.last_cursor;
  }
  return cells.sort((left, right) => compareBigInt(left.capacity, right.capacity));
}

function selectFunding(cells: FundingCell[], required: bigint) {
  const single = cells.find((cell) => cell.capacity >= required);
  if (single) return { inputs: [toInput(single)], total: single.capacity };
  const inputs: TxInput[] = [];
  let total = BigInt(0);
  for (const cell of [...cells].sort((left, right) => compareBigInt(right.capacity, left.capacity))) {
    inputs.push(toInput(cell));
    total += cell.capacity;
    if (total >= required) return { inputs, total };
  }
  const largest = cells.reduce((max, cell) => (cell.capacity > max ? cell.capacity : max), BigInt(0));
  throw new Error(`Wallet needs ${formatCkb(required)} unlocked CKB for settlement fees. Largest clean cell is ${formatCkb(largest)}.`);
}

function toInput(cell: FundingCell): TxInput { return { previousOutput: cell.previousOutput, since: cell.since }; }

function getCellsParams(lock: JoyScript, cursor: string | null): unknown[] {
  const params: unknown[] = [
    {
      script: toRpcScript(lock),
      script_type: "lock",
      script_search_mode: "exact",
      filter: { output_data_len_range: ["0x0", "0x1"] },
      with_data: true,
    },
    "asc",
    "0x64",
  ];
  if (cursor) params.push(cursor);
  return params;
}

async function callCkbRpc<T>(method: string, params: unknown[]): Promise<T> {
  if (!ckbRpcURL?.trim()) throw new Error("NEXT_PUBLIC_CKB_RPC_URL is required for vault settlement.");
  const response = await fetch(ckbRpcURL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: Date.now(), jsonrpc: "2.0", method, params }) });
  if (!response.ok) throw new Error(`CKB RPC ${method} failed with HTTP ${response.status}.`);
  const body = (await response.json()) as { result?: T; error?: { message?: string } };
  if (body.error) throw new Error(body.error.message ?? `CKB RPC ${method} failed.`);
  if (body.result === undefined || body.result === null) throw new Error(`CKB RPC ${method} returned no result.`);
  return body.result;
}

function buildFeeClaimType(userLock: JoyScript, vaultType: JoyScript, receiptType: JoyScript, scripts: RequiredScripts, claimId: string): JoyScript {
  return { codeHash: scripts.fee_claim_type_code_hash, hashType: "data1", args: joinHex([scriptToHash(vaultType), scriptToHash(receiptType), scriptToHash(userLock), fixedId(claimId)]) };
}

function requiredScripts(scripts?: VaultScripts): RequiredScripts {
  if (!scripts) throw new Error("LiquidLane script config is missing. Sync Core and retry.");
  return {
    vault_lock_code_hash: requireHash(scripts.vault_lock_code_hash, "vault lock code hash"),
    vault_lock_out_point: requireOutPoint(scripts.vault_lock_out_point, "vault lock out-point"),
    vault_type_code_hash: requireHash(scripts.vault_type_code_hash, "vault type code hash"),
    vault_type_out_point: requireOutPoint(scripts.vault_type_out_point, "vault type out-point"),
    lp_receipt_type_code_hash: requireHash(scripts.lp_receipt_type_code_hash, "LP receipt code hash"),
    lp_receipt_type_out_point: requireOutPoint(scripts.lp_receipt_type_out_point, "LP receipt out-point"),
    fee_claim_type_code_hash: requireHash(scripts.fee_claim_type_code_hash, "fee claim code hash"),
    fee_claim_type_out_point: requireOutPoint(scripts.fee_claim_type_out_point, "fee claim out-point"),
  };
}

type RequiredScripts = {
  vault_lock_code_hash: string;
  vault_lock_out_point: string;
  vault_type_code_hash: string;
  vault_type_out_point: string;
  lp_receipt_type_code_hash: string;
  lp_receipt_type_out_point: string;
  fee_claim_type_code_hash: string;
  fee_claim_type_out_point: string;
};

function parseVaultData(hex: string): VaultData {
  const bytes = hexBytes(hex);
  if (bytes.length !== VAULT_DATA_LEN || bytes[0] !== 1) throw new Error("Vault cell data is invalid.");
  return { total: readU64(bytes, 1), reserved: readU64(bytes, 9), deployed: readU64(bytes, 17), feeBalance: readU64(bytes, 25) };
}

function parseReceiptData(hex: string): ReceiptData {
  const bytes = hexBytes(hex);
  if (bytes.length !== RECEIPT_DATA_LEN || bytes[0] !== 1) throw new Error("LP receipt data is invalid.");
  return { supplied: readU64(bytes, 1), available: readU64(bytes, 9), reserved: readU64(bytes, 17), deployed: readU64(bytes, 25), claimed: readU64(bytes, 33) };
}

function vaultDataHex(data: VaultData) { return joinHex(["0x01", u64Le(data.total), u64Le(data.reserved), u64Le(data.deployed), u64Le(data.feeBalance)]); }
function receiptDataHex(data: ReceiptData) { return joinHex(["0x01", u64Le(data.supplied), u64Le(data.available), u64Le(data.reserved), u64Le(data.deployed), u64Le(data.claimed)]); }
function feeClaimDataHex(status: number, amount: bigint) { return joinHex([`0x${status.toString(16).padStart(2, "0")}`, u64Le(amount)]); }
function occupiedCapacity(lock: JoyScript, type: JoyScript | null, dataLength: number) { return BigInt(8 + scriptOccupied(lock) + (type ? scriptOccupied(type) : 0) + dataLength) * SHANNONS_PER_CKB; }

function configuredJoyIdCellDep(): CellDep[] {
  const txHash = JOYID_CELL_DEP_TX_HASH?.trim();
  if (txHash) {
    const depType = JOYID_CELL_DEP_TYPE ?? "dep_group";
    if (depType !== "dep_group" && depType !== "code") throw new Error("NEXT_PUBLIC_JOYID_CELL_DEP_TYPE must be dep_group or code.");
    return [{ outPoint: { txHash, index: JOYID_CELL_DEP_INDEX }, depType: depType === "dep_group" ? "depGroup" : "code" }];
  }
  if (ckbNetwork === "testnet") return [TESTNET_JOYID_DEP_GROUP];
  return [];
}

function codeDep(value: string): CellDep { return { outPoint: parseOutPoint(value), depType: "code" }; }
function parseOutPoint(value?: string | null): OutPoint {
  const [txHash, index] = (value ?? "").split("#");
  if (!isHash(txHash) || !index?.startsWith("0x")) throw new Error("LiquidLane out-point config is invalid.");
  return { txHash, index };
}
function ckbAmount(value: number) { if (!Number.isSafeInteger(value) || value <= 0) throw new Error("Amount must be a positive whole CKB amount."); const units = BigInt(value); return { units, shannons: units * SHANNONS_PER_CKB }; }
function toJoyScript(script: { codeHash?: string; code_hash?: string; hashType?: string; hash_type?: string; args?: string }): JoyScript {
  const codeHash = script.codeHash ?? script.code_hash ?? "";
  const hashType = script.hashType ?? script.hash_type ?? "";
  if (!isHash(codeHash) || !isHashType(hashType)) throw new Error("Unsupported CKB script returned by RPC.");
  return { codeHash, hashType, args: script.args || "0x" };
}
function toRpcScript(script: JoyScript): RpcScript { return { code_hash: script.codeHash, hash_type: script.hashType, args: script.args }; }
function sameScript(left: JoyScript, right: JoyScript) { return left.codeHash.toLowerCase() === right.codeHash.toLowerCase() && left.hashType === right.hashType && left.args.toLowerCase() === right.args.toLowerCase(); }
function emptyWitness() { return serializeWitnessArgs({ lock: "0x", inputType: "0x", outputType: "0x" }); }
function assertJoyIdSignedWitness(unsignedTx: CKBTransaction, signedTx: CKBTransaction, witnessIndexes: number[]) {
  if (!Array.isArray(signedTx.witnesses) || signedTx.witnesses.length === 0) throw new Error("JoyID returned no signed witnesses. No settlement transaction was broadcast.");
  const signed = witnessIndexes.some((index) => (signedTx.witnesses[index] ?? "0x") !== (unsignedTx.witnesses[index] ?? "0x"));
  if (!signed) throw new Error("JoyID returned without a CKB signature. No settlement transaction was broadcast.");
}
function reportProgress(options: { onProgress?: (step: SettlementProgressStep, message: string) => void }, popup: JoyIdPopup | undefined, step: SettlementProgressStep, message: string) {
  options.onProgress?.(step, message);
  showJoyIdPopupStatus(popup, step === "signing" ? "Opening JoyID" : "Preparing settlement", message);
}
function requireHash(value: string | null | undefined, label: string) { if (!isHash(value ?? "")) throw new Error(`LiquidLane ${label} is missing.`); return normalizeHash(value!); }
function requireOutPoint(value: string | null | undefined, label: string) { parseOutPoint(value); return value!; }
function normalizeHash(value: string) { return value.toLowerCase(); }
function isHash(value: string) { return /^0x[0-9a-fA-F]{64}$/.test(value); }
function isHashType(value: string): value is HashType { return value === "type" || value === "data" || value === "data1"; }
function joinHex(values: string[]) { return `0x${values.map((value) => value.replace(/^0x/, "")).join("")}`; }
function fixedId(id: string) { return id.replace(/[^0-9a-fA-F]/g, "").slice(0, 64).padEnd(64, "0"); }
function hexBytes(hex: string) { const clean = hex.replace(/^0x/, ""); if (clean.length % 2 !== 0) throw new Error("Invalid hex data returned by CKB RPC."); const bytes: number[] = []; for (let i = 0; i < clean.length; i += 2) bytes.push(Number.parseInt(clean.slice(i, i + 2), 16)); return bytes; }
function readU64(bytes: number[], offset: number) { let value = BigInt(0); for (let i = 0; i < 8; i += 1) value += BigInt(bytes[offset + i]) << BigInt(8 * i); return value; }
function u64Le(value: bigint) { if (value < BigInt(0) || value > BigInt("0xffffffffffffffff")) throw new Error("CKB u64 value is out of range."); const bytes: number[] = []; for (let i = 0; i < 8; i += 1) bytes.push(Number((value >> BigInt(8 * i)) & BigInt(0xff))); return `0x${bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("")}`; }
function toHex(value: bigint) { return `0x${value.toString(16)}`; }
function formatCkb(shannons: bigint) { const whole = shannons / SHANNONS_PER_CKB; const fraction = shannons % SHANNONS_PER_CKB; if (fraction === BigInt(0)) return `${whole.toLocaleString()} CKB`; return `${whole.toLocaleString()}.${fraction.toString().padStart(8, "0").replace(/0+$/, "")} CKB`; }
function compareBigInt(left: bigint, right: bigint) { if (left < right) return -1; if (left > right) return 1; return 0; }
