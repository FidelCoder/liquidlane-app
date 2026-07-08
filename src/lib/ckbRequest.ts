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
const REQUEST_DATA_LEN = 26;
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
type RequestInput = { previousOutput: OutPoint; since: string };

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

type RequestIntent = {
  id: string;
  asset: string;
  amount: number;
  duration_days: number;
  lease_fee: number;
};

type RpcCell = {
  output: {
    capacity: string;
    lock: RpcScript;
    type?: RpcScript | null;
  };
  data?: { content: string } | null;
};

type RpcLiveCell = RpcCell & {
  output_data?: string;
  out_point: { tx_hash: string; index: string };
};

type GetCellsResponse = {
  objects: RpcLiveCell[];
  last_cursor: string;
};

type GetLiveCellResponse = {
  cell: RpcCell | null;
  status: "live" | "dead" | "unknown";
};

type FundingCell = RequestInput & { capacity: bigint };
type VaultCell = {
  input: RequestInput;
  capacity: bigint;
  lock: JoyScript;
  type: JoyScript;
  data: VaultData;
};

type VaultData = {
  total: bigint;
  reserved: bigint;
  deployed: bigint;
  feeBalance: bigint;
};

export type RequestCapacityOptions = {
  vault: VaultConfig;
  intent: RequestIntent;
  asset: string;
  amount: number;
  onProgress?: (step: RequestProgressStep, message: string) => void;
};

export type RequestCapacityResult = {
  tx: CKBTransaction;
  txHash: string;
  requestCellOutPoint: string;
};

export type RequestProgressStep = "vault" | "funding" | "signing" | "verify" | "broadcast";

export async function reserveVaultCapacity(
  wallet: ConnectedCkbWallet,
  options: RequestCapacityOptions,
  popup?: JoyIdPopup,
): Promise<RequestCapacityResult> {
  if (options.asset.trim().toUpperCase() !== "CKB") {
    throw new Error("The live capacity request path is currently enabled for CKB.");
  }
  if (options.amount !== options.intent.amount) {
    throw new Error("Capacity request amount does not match the active request intent.");
  }
  if (!options.vault.address?.trim()) {
    throw new Error("LiquidLane vault address is not configured.");
  }

  const amount = ckbAmount(options.amount);
  const leaseFee = ckbAmount(options.intent.lease_fee);
  const scripts = requiredScripts(options.vault.scripts);
  const userLock = toJoyScript(addressToScript(wallet.ckbAddress));
  const operatorLock = toJoyScript(addressToScript(options.vault.address));

  reportProgress(options, popup, "vault", "Loading the active vault cell for the capacity reservation.");
  const vaultCell = await loadVaultCell(options.vault, scripts);
  const configuredVaultLock = toJoyScript(addressToScript(options.vault.address));
  if (!sameScript(vaultCell.lock, configuredVaultLock)) {
    throw new Error("Configured vault cell lock does not match the active LiquidLane vault address.");
  }
  if (availableVaultUnits(vaultCell.data) < amount.units) {
    throw new Error("Vault has insufficient available CKB for this capacity request.");
  }

  const requestType = buildRequestType(userLock, operatorLock, vaultCell.type, scripts, options.intent.id);
  const requestCapacity = occupiedCapacity(userLock, requestType, REQUEST_DATA_LEN) + CELL_CAPACITY_PAD;
  const minChangeCapacity = occupiedCapacity(userLock, null, 0) + CELL_CAPACITY_PAD;
  const requiredFunding = requestCapacity + leaseFee.shannons + minChangeCapacity + FEE_MARGIN;

  reportProgress(options, popup, "funding", "Selecting a JoyID CKB cell to create the request cell.");
  const funding = selectFunding(await collectFundingCells(userLock), requiredFunding);
  const unsignedTx = buildRequestTransaction({
    amount,
    leaseFee,
    funding,
    userLock,
    vaultCell,
    requestType,
    requestCapacity,
    minChangeCapacity,
    scripts,
    expiry: requestExpiry(options.intent.duration_days),
  });

  reportProgress(options, popup, "signing", "Review the LiquidLane capacity request in JoyID and confirm.");
  const signedTx = await signRawCkbTransaction(wallet, unsignedTx, [0], popup);
  assertJoyIdSignedWitness(unsignedTx, signedTx, [0]);

  reportProgress(options, popup, "verify", "Dry-running the signed capacity request before broadcast.");
  await dryRunCkbTransaction(signedTx);

  reportProgress(options, popup, "broadcast", "Broadcasting the verified capacity request to CKB testnet.");
  const txHash = await broadcastCkbTransaction(signedTx);
  return { tx: { ...signedTx, hash: txHash }, txHash, requestCellOutPoint: `${txHash}#0x1` };
}

function buildRequestTransaction(input: {
  amount: { units: bigint };
  leaseFee: { units: bigint; shannons: bigint };
  funding: { inputs: RequestInput[]; total: bigint };
  userLock: JoyScript;
  vaultCell: VaultCell;
  requestType: JoyScript;
  requestCapacity: bigint;
  minChangeCapacity: bigint;
  scripts: RequiredScripts;
  expiry: bigint;
}): CKBTransaction {
  const spendCapacity = input.requestCapacity + input.leaseFee.shannons + FEE_MARGIN;
  const changeCapacity = input.funding.total - spendCapacity;
  if (changeCapacity < input.minChangeCapacity) {
    throw new Error("Funding cell does not leave enough capacity for JoyID change after request creation.");
  }

  return {
    version: "0x0",
    cellDeps: [
      ...configuredJoyIdCellDep(),
      codeDep(input.scripts.vault_lock_out_point),
      codeDep(input.scripts.vault_type_out_point),
      codeDep(input.scripts.request_type_out_point),
    ],
    headerDeps: [],
    inputs: [...input.funding.inputs, input.vaultCell.input],
    outputs: [
      {
        capacity: toHex(input.vaultCell.capacity + input.leaseFee.shannons),
        lock: input.vaultCell.lock,
        type: input.vaultCell.type,
      },
      {
        capacity: toHex(input.requestCapacity),
        lock: input.userLock,
        type: input.requestType,
      },
      {
        capacity: toHex(changeCapacity),
        lock: input.userLock,
      },
    ],
    outputsData: [
      vaultDataHex({
        ...input.vaultCell.data,
        reserved: input.vaultCell.data.reserved + input.amount.units,
        feeBalance: input.vaultCell.data.feeBalance + input.leaseFee.units,
      }),
      requestDataHex({ status: 1, amount: input.amount.units, leaseFee: input.leaseFee.units, expiry: input.expiry }),
      "0x",
    ],
    witnesses: [emptyWitness(), ...input.funding.inputs.slice(1).map(() => "0x"), "0x"],
  };
}

async function loadVaultCell(vault: VaultConfig, scripts: RequiredScripts): Promise<VaultCell> {
  const outPoint = parseOutPoint(vault.cell_out_point);
  const result = await callCkbRpc<GetLiveCellResponse>("get_live_cell", [
    { tx_hash: outPoint.txHash, index: outPoint.index },
    true,
  ]);
  if (result.status !== "live" || !result.cell) {
    throw new Error(`Configured vault cell is ${result.status}. Refresh Core deployment config.`);
  }

  const type = result.cell.output.type ? toJoyScript(result.cell.output.type) : null;
  if (!type || normalizeHash(type.codeHash) !== normalizeHash(scripts.vault_type_code_hash)) {
    throw new Error("Configured vault cell does not use the active LiquidLane vault type script.");
  }

  return {
    input: { previousOutput: outPoint, since: "0x0" },
    capacity: BigInt(result.cell.output.capacity),
    lock: toJoyScript(result.cell.output.lock),
    type,
    data: parseVaultData(result.cell.data?.content ?? "0x"),
  };
}

async function collectFundingCells(lock: JoyScript): Promise<FundingCell[]> {
  const cells: FundingCell[] = [];
  let cursor: string | null = null;
  for (let round = 0; round < MAX_COLLECTION_ROUNDS; round += 1) {
    const result: GetCellsResponse = await callCkbRpc<GetCellsResponse>("get_cells", getCellsParams(lock, cursor));
    for (const cell of result.objects) {
      if (cell.output.type) continue;
      cells.push({
        previousOutput: { txHash: cell.out_point.tx_hash, index: cell.out_point.index },
        since: "0x0",
        capacity: BigInt(cell.output.capacity),
      });
    }
    if (!result.last_cursor || result.last_cursor === cursor || result.objects.length === 0) break;
    cursor = result.last_cursor;
  }
  return cells.sort((left, right) => compareBigInt(left.capacity, right.capacity));
}

function selectFunding(cells: FundingCell[], required: bigint) {
  const single = cells.find((cell) => cell.capacity >= required);
  if (single) {
    return { inputs: [toInput(single)], total: single.capacity };
  }
  const inputs: RequestInput[] = [];
  let total = BigInt(0);
  for (const cell of [...cells].sort((left, right) => compareBigInt(right.capacity, left.capacity))) {
    inputs.push(toInput(cell));
    total += cell.capacity;
    if (total >= required) return { inputs, total };
  }
  const largest = cells.reduce((max, cell) => (cell.capacity > max ? cell.capacity : max), BigInt(0));
  throw new Error(`Wallet needs ${formatCkb(required)} unlocked CKB to create the request cell. Largest clean cell is ${formatCkb(largest)}.`);
}

function toInput(cell: FundingCell): RequestInput {
  return { previousOutput: cell.previousOutput, since: cell.since };
}

function getCellsParams(lock: JoyScript, cursor: string | null): unknown[] {
  const params: unknown[] = [
    {
      script: toRpcScript(lock),
      script_type: "lock",
      filter: { output_data_len_range: ["0x0", "0x1"] },
    },
    "asc",
    "0x64",
  ];
  if (cursor) params.push(cursor);
  return params;
}

async function callCkbRpc<T>(method: string, params: unknown[]): Promise<T> {
  if (!ckbRpcURL?.trim()) throw new Error("NEXT_PUBLIC_CKB_RPC_URL is required for capacity requests.");
  const response = await fetch(ckbRpcURL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: Date.now(), jsonrpc: "2.0", method, params }),
  });
  if (!response.ok) throw new Error(`CKB RPC ${method} failed with HTTP ${response.status}.`);
  const body = (await response.json()) as { result?: T; error?: { message?: string } };
  if (body.error) throw new Error(body.error.message ?? `CKB RPC ${method} failed.`);
  if (body.result === undefined || body.result === null) throw new Error(`CKB RPC ${method} returned no result.`);
  return body.result;
}

function buildRequestType(
  userLock: JoyScript,
  operatorLock: JoyScript,
  vaultType: JoyScript,
  scripts: RequiredScripts,
  intentId: string,
): JoyScript {
  const args = joinHex([
    scriptToHash(vaultType),
    scriptToHash(userLock),
    scriptToHash(operatorLock),
    requestId(intentId),
  ]);
  return { codeHash: scripts.request_type_code_hash, hashType: "data1", args };
}

function requiredScripts(scripts?: VaultScripts): RequiredScripts {
  if (!scripts) throw new Error("LiquidLane script config is missing. Sync Core and retry.");
  return {
    vault_lock_code_hash: requireHash(scripts.vault_lock_code_hash, "vault lock code hash"),
    vault_lock_out_point: requireOutPoint(scripts.vault_lock_out_point, "vault lock out-point"),
    vault_type_code_hash: requireHash(scripts.vault_type_code_hash, "vault type code hash"),
    vault_type_out_point: requireOutPoint(scripts.vault_type_out_point, "vault type out-point"),
    request_type_code_hash: requireHash(scripts.request_type_code_hash, "request code hash"),
    request_type_out_point: requireOutPoint(scripts.request_type_out_point, "request out-point"),
  };
}

type RequiredScripts = {
  vault_lock_code_hash: string;
  vault_lock_out_point: string;
  vault_type_code_hash: string;
  vault_type_out_point: string;
  request_type_code_hash: string;
  request_type_out_point: string;
};

function parseVaultData(hex: string): VaultData {
  const bytes = hexBytes(hex);
  if (bytes.length !== VAULT_DATA_LEN || bytes[0] !== 1) throw new Error("Vault cell data is invalid.");
  return {
    total: readU64(bytes, 1),
    reserved: readU64(bytes, 9),
    deployed: readU64(bytes, 17),
    feeBalance: readU64(bytes, 25),
  };
}

function vaultDataHex(data: VaultData) {
  return joinHex(["0x01", u64Le(data.total), u64Le(data.reserved), u64Le(data.deployed), u64Le(data.feeBalance)]);
}

function requestDataHex(data: { status: number; amount: bigint; leaseFee: bigint; expiry: bigint }) {
  return joinHex(["0x01", `0x${data.status.toString(16).padStart(2, "0")}`, u64Le(data.amount), u64Le(data.leaseFee), u64Le(data.expiry)]);
}

function occupiedCapacity(lock: JoyScript, type: JoyScript | null, dataLength: number) {
  return BigInt(8 + scriptOccupied(lock) + (type ? scriptOccupied(type) : 0) + dataLength) * SHANNONS_PER_CKB;
}

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

function codeDep(value: string): CellDep {
  const outPoint = parseOutPoint(value);
  return { outPoint, depType: "code" };
}

function parseOutPoint(value?: string | null): OutPoint {
  const [txHash, index] = (value ?? "").split("#");
  if (!isHash(txHash) || !index?.startsWith("0x")) throw new Error("LiquidLane vault out-point config is invalid.");
  return { txHash, index };
}

function ckbAmount(value: number) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error("Amount must be a positive whole CKB amount.");
  const units = BigInt(value);
  return { units, shannons: units * SHANNONS_PER_CKB };
}

function requestExpiry(durationDays: number) {
  const days = Number.isSafeInteger(durationDays) && durationDays > 0 ? durationDays : 1;
  return BigInt(Math.floor(Date.now() / 1000) + days * 24 * 60 * 60);
}

function availableVaultUnits(data: VaultData) {
  return data.total - data.reserved - data.deployed;
}

function toJoyScript(script: { codeHash?: string; code_hash?: string; hashType?: string; hash_type?: string; args?: string }): JoyScript {
  const codeHash = script.codeHash ?? script.code_hash ?? "";
  const hashType = script.hashType ?? script.hash_type ?? "";
  if (!isHash(codeHash) || !isHashType(hashType)) throw new Error("Unsupported CKB script returned by RPC.");
  return { codeHash, hashType, args: script.args || "0x" };
}

function toRpcScript(script: JoyScript): RpcScript {
  return { code_hash: script.codeHash, hash_type: script.hashType, args: script.args };
}

function sameScript(left: JoyScript, right: JoyScript) {
  return left.codeHash.toLowerCase() === right.codeHash.toLowerCase() &&
    left.hashType === right.hashType &&
    left.args.toLowerCase() === right.args.toLowerCase();
}

function emptyWitness() {
  return serializeWitnessArgs({ lock: "0x", inputType: "0x", outputType: "0x" });
}

function assertJoyIdSignedWitness(unsignedTx: CKBTransaction, signedTx: CKBTransaction, witnessIndexes: number[]) {
  if (!Array.isArray(signedTx.witnesses) || signedTx.witnesses.length === 0) {
    throw new Error("JoyID returned no signed witnesses. No capacity request transaction was broadcast.");
  }
  const signed = witnessIndexes.some((index) => (signedTx.witnesses[index] ?? "0x") !== (unsignedTx.witnesses[index] ?? "0x"));
  if (!signed) {
    throw new Error("JoyID returned without a CKB signature. No capacity request transaction was broadcast.");
  }
}

function reportProgress(options: RequestCapacityOptions, popup: JoyIdPopup | undefined, step: RequestProgressStep, message: string) {
  const title = step === "signing" ? "Opening JoyID" : "Preparing CKB request";
  options.onProgress?.(step, message);
  showJoyIdPopupStatus(popup, title, message);
}

function requireHash(value: string | null | undefined, label: string) {
  if (!isHash(value ?? "")) throw new Error(`LiquidLane ${label} is missing.`);
  return normalizeHash(value!);
}

function requireOutPoint(value: string | null | undefined, label: string) {
  parseOutPoint(value);
  return value!;
}

function normalizeHash(value: string) {
  return value.toLowerCase();
}

function isHash(value: string) {
  return /^0x[0-9a-fA-F]{64}$/.test(value);
}

function isHashType(value: string): value is HashType {
  return value === "type" || value === "data" || value === "data1";
}

function joinHex(values: string[]) {
  return `0x${values.map((value) => value.replace(/^0x/, "")).join("")}`;
}

function requestId(id: string) {
  return id.replace(/[^0-9a-fA-F]/g, "").slice(0, 64).padEnd(64, "0");
}

function hexBytes(hex: string) {
  const clean = hex.replace(/^0x/, "");
  if (clean.length % 2 !== 0) throw new Error("Invalid hex data returned by CKB RPC.");
  const bytes: number[] = [];
  for (let index = 0; index < clean.length; index += 2) {
    bytes.push(Number.parseInt(clean.slice(index, index + 2), 16));
  }
  return bytes;
}

function readU64(bytes: number[], offset: number) {
  let value = BigInt(0);
  for (let index = 0; index < 8; index += 1) value += BigInt(bytes[offset + index]) << BigInt(8 * index);
  return value;
}

function u64Le(value: bigint) {
  if (value < BigInt(0) || value > BigInt("0xffffffffffffffff")) throw new Error("CKB u64 value is out of range.");
  const bytes: number[] = [];
  for (let index = 0; index < 8; index += 1) bytes.push(Number((value >> BigInt(8 * index)) & BigInt(0xff)));
  return `0x${bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function toHex(value: bigint) {
  return `0x${value.toString(16)}`;
}

function formatCkb(shannons: bigint) {
  const whole = shannons / SHANNONS_PER_CKB;
  const fraction = shannons % SHANNONS_PER_CKB;
  if (fraction === BigInt(0)) return `${whole.toLocaleString()} CKB`;
  return `${whole.toLocaleString()}.${fraction.toString().padStart(8, "0").replace(/0+$/, "")} CKB`;
}

function compareBigInt(left: bigint, right: bigint) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
