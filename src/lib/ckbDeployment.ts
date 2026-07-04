import { type CKBTransaction } from "@joyid/ckb";
import { addressToScript, scriptToHash, serializeWitnessArgs } from "@nervosnetwork/ckb-sdk-utils";
import {
  broadcastCkbTransaction,
  ckbNetwork,
  ckbRpcURL,
  signRawCkbTransaction,
  type ConnectedCkbWallet,
  type JoyIdPopup,
} from "@/lib/ckbWallet";

const SHANNONS_PER_CKB = BigInt(100_000_000);
const SCRIPT_CELL_OVERHEAD_CKB = BigInt(600);
const CHANGE_CELL_CKB = BigInt(200);
const DEPLOY_FEE_CKB = BigInt(10);
const MAX_COLLECTION_ROUNDS = 10;
const EXPLORER_BASE = process.env.NEXT_PUBLIC_CKB_EXPLORER_URL ?? "https://pudge.explorer.nervos.org";
const JOYID_CELL_DEP_TX_HASH = process.env.NEXT_PUBLIC_JOYID_CELL_DEP_TX_HASH;
const JOYID_CELL_DEP_INDEX = process.env.NEXT_PUBLIC_JOYID_CELL_DEP_INDEX ?? "0x0";
const JOYID_CELL_DEP_TYPE = process.env.NEXT_PUBLIC_JOYID_CELL_DEP_TYPE;
const TESTNET_JOYID_CODE_CELL_DEP: CellDep = {
  outPoint: {
    txHash: "0x4a596d31dc35e88fb1591debbf680b04a44b4a434e3a94453c21ea8950ffb4d9",
    index: "0x0",
  },
  depType: "code",
};

type HashType = "type" | "data" | "data1";
type CellDep = CKBTransaction["cellDeps"][number];

type DeploymentPackage = {
  network: string;
  scripts: DeploymentPackageScript[];
};

type DeploymentPackageScript = {
  name: string;
  size_bytes: number;
  ckb_data_hash: string;
  hash_type: HashType;
  data_hex: string;
};

type JoyScript = {
  codeHash: string;
  hashType: HashType;
  args: string;
};

type RpcScript = {
  code_hash: string;
  hash_type: HashType;
  args: string;
};

type RpcLiveCell = {
  output: {
    capacity: string;
    lock: RpcScript;
    type?: RpcScript | null;
  };
  output_data?: string;
  out_point: {
    tx_hash: string;
    index: string;
  };
};

type GetCellsResponse = {
  objects: RpcLiveCell[];
  last_cursor: string;
};

type GetLiveCellResponse = {
  cell: unknown | null;
  status: "live" | "dead" | "unknown";
};

type DeploymentInput = {
  previousOutput: {
    txHash: string;
    index: string;
  };
  since: string;
};

type FundingCandidate = DeploymentInput & {
  capacity: bigint;
};

type DeploymentFunding = {
  inputs: DeploymentInput[];
  totalCapacity: bigint;
};

type DeploymentTransactionPlan = {
  scripts: DeploymentPackageScript[];
  funding: DeploymentFunding;
  requiredCapacity: bigint;
};

export type DeploymentRecordScript = {
  name: string;
  codeHash: string;
  hashType: HashType;
  outputIndex: string;
  outPoint: string;
  explorerUrl: string;
};

export type DeploymentTransactionRecord = {
  txHash: string;
  explorerUrl: string;
};

export type DeploymentResult = {
  txHash: string;
  explorerUrl: string;
  transactions: DeploymentTransactionRecord[];
  requiredCkb: string;
  deployedCkb: string;
  scripts: DeploymentRecordScript[];
};

export type DeploymentProgress = "package" | "funding" | "signing" | "broadcast";

export type DeploymentProgressDetail = {
  current: number;
  total: number;
  scriptName: string;
};

export type DeploymentOptions = {
  popup?: JoyIdPopup;
  popups?: JoyIdPopup[];
  onProgress?: (step: DeploymentProgress, detail?: DeploymentProgressDetail) => void;
};

export async function deployCkbScripts(
  apiBase: string,
  wallet: ConnectedCkbWallet,
  options: DeploymentOptions = {},
): Promise<DeploymentResult> {
  try {
    options.onProgress?.("package");
    const deploymentPackage = await fetchDeploymentPackage(apiBase);
    if (deploymentPackage.network !== "testnet" || ckbNetwork !== "testnet") {
      throw new Error("LiquidLane script deployment is currently enabled for CKB testnet only.");
    }

    const deployerLock = addressToJoyScript(addressToScript(wallet.ckbAddress));
    const joyIdCellDeps = await resolveJoyIdCellDeps();
    options.onProgress?.("funding");
    const candidates = await collectFundingCandidates(deployerLock);
    const plans = planDeploymentTransactions(deploymentPackage.scripts, candidates);
    const signingPopups = usableDeploymentPopups(options);
    if (signingPopups.length < plans.length) {
      throw new Error(`Browser opened ${signingPopups.length} JoyID popup(s), but this deployment needs ${plans.length} signature window(s). Enable popups for localhost and retry.`);
    }

    const transactions: DeploymentTransactionRecord[] = [];
    const records: DeploymentRecordScript[] = [];
    let totalRequiredCapacity = BigInt(0);
    let totalDeployedCapacity = BigInt(0);

    for (let planIndex = 0; planIndex < plans.length; planIndex += 1) {
      const plan = plans[planIndex];
      const detail = deploymentProgressDetail(plan, planIndex, plans.length);
      const tx = buildDeploymentTransaction(deployerLock, plan.scripts, plan.funding, plan.requiredCapacity, joyIdCellDeps);
      const joyIdWitnessIndexes = plan.funding.inputs.map((_, index) => index);

      options.onProgress?.("signing", detail);
      const signedTx = await signRawCkbTransaction(wallet, tx, joyIdWitnessIndexes, signingPopups[planIndex]);
      assertSignedRawTransactionMatches(tx, signedTx);
      options.onProgress?.("broadcast", detail);
      const txHash = await broadcastCkbTransaction(signedTx);
      const explorerUrl = transactionExplorerUrl(txHash);

      transactions.push({ txHash, explorerUrl });
      records.push(...deploymentScriptRecords(plan.scripts, txHash, explorerUrl));
      totalRequiredCapacity += plan.requiredCapacity;
      totalDeployedCapacity += codeCellCapacity(plan.scripts);
    }

    const firstTransaction = transactions[0];
    if (!firstTransaction) {
      throw new Error("No deployment transactions were produced from the CKB script package.");
    }

    return {
      txHash: firstTransaction.txHash,
      explorerUrl: firstTransaction.explorerUrl,
      transactions,
      requiredCkb: formatCkb(totalRequiredCapacity),
      deployedCkb: formatCkb(totalDeployedCapacity),
      scripts: records,
    };
  } finally {
    closeUnusedDeploymentPopups(options);
  }
}

async function fetchDeploymentPackage(apiBase: string): Promise<DeploymentPackage> {
  const response = await fetch(`${apiBase}/deployment/package`);
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: "Could not load deployment package" }));
    throw new Error(body.error ?? "Could not load deployment package");
  }
  const body = (await response.json()) as DeploymentPackage;
  if (!body.scripts.length) {
    throw new Error("Core returned an empty CKB deployment package.");
  }
  return body;
}

async function collectFundingCandidates(lock: JoyScript): Promise<FundingCandidate[]> {
  if (!ckbRpcURL?.trim()) {
    throw new Error("NEXT_PUBLIC_CKB_RPC_URL is required for testnet deployment.");
  }

  const candidates: FundingCandidate[] = [];
  let cursor: string | null = null;

  for (let round = 0; round < MAX_COLLECTION_ROUNDS; round += 1) {
    const result: GetCellsResponse = await callCkbRpc<GetCellsResponse>("get_cells", getCellsParams(lock, cursor));
    for (const cell of result.objects) {
      if (cell.output.type) continue;
      if ((cell.output_data ?? "0x") !== "0x") continue;
      candidates.push({
        previousOutput: {
          txHash: cell.out_point.tx_hash,
          index: cell.out_point.index,
        },
        since: "0x0",
        capacity: BigInt(cell.output.capacity),
      });
    }
    if (!result.objects.length || cursor === result.last_cursor) break;
    cursor = result.last_cursor;
  }

  return candidates;
}

function planDeploymentTransactions(
  scripts: DeploymentPackageScript[],
  candidates: FundingCandidate[],
): DeploymentTransactionPlan[] {
  const fullRequiredCapacity = requiredDeploymentCapacity(scripts);
  const fullFunding = selectSingleFundingCell(candidates, fullRequiredCapacity);
  if (fullFunding) {
    return [{ scripts, funding: fullFunding, requiredCapacity: fullRequiredCapacity }];
  }

  const remainingScripts = [...scripts].sort((left, right) => compareCapacityDesc(scriptCellCapacity(left), scriptCellCapacity(right)));
  const plans: DeploymentTransactionPlan[] = [];

  for (const candidate of [...candidates].sort((left, right) => compareCapacityDesc(left.capacity, right.capacity))) {
    const plannedScripts: DeploymentPackageScript[] = [];
    let codeCapacity = BigInt(0);
    let index = 0;

    while (index < remainingScripts.length) {
      const script = remainingScripts[index];
      const nextCodeCapacity = codeCapacity + scriptCellCapacity(script);
      const nextRequiredCapacity = nextCodeCapacity + deploymentFixedCapacity();
      if (nextRequiredCapacity <= candidate.capacity) {
        plannedScripts.push(script);
        codeCapacity = nextCodeCapacity;
        remainingScripts.splice(index, 1);
      } else {
        index += 1;
      }
    }

    if (plannedScripts.length > 0) {
      plans.push({
        scripts: plannedScripts,
        funding: { inputs: [toDeploymentInput(candidate)], totalCapacity: candidate.capacity },
        requiredCapacity: codeCapacity + deploymentFixedCapacity(),
      });
    }
    if (remainingScripts.length === 0) return plans;
  }

  throw new Error(splitDeploymentFundingError(candidates, remainingScripts));
}

function deploymentProgressDetail(
  plan: DeploymentTransactionPlan,
  planIndex: number,
  planCount: number,
): DeploymentProgressDetail {
  return {
    current: planIndex + 1,
    total: planCount,
    scriptName: plan.scripts.map((script) => script.name).join(", "),
  };
}

function deploymentScriptRecords(
  scripts: DeploymentPackageScript[],
  txHash: string,
  explorerUrl: string,
): DeploymentRecordScript[] {
  return scripts.map((script, index) => ({
    name: script.name,
    codeHash: script.ckb_data_hash,
    hashType: script.hash_type,
    outputIndex: toHex(BigInt(index)),
    outPoint: `${txHash}#${toHex(BigInt(index))}`,
    explorerUrl,
  }));
}

function selectSingleFundingCell(candidates: FundingCandidate[], requiredCapacity: bigint): DeploymentFunding | null {
  const single = candidates
    .filter((candidate) => candidate.capacity >= requiredCapacity)
    .sort((left, right) => compareCapacityAsc(left.capacity, right.capacity))[0];

  if (!single) return null;
  return {
    inputs: [toDeploymentInput(single)],
    totalCapacity: single.capacity,
  };
}

function toDeploymentInput(candidate: FundingCandidate): DeploymentInput {
  return {
    previousOutput: candidate.previousOutput,
    since: candidate.since,
  };
}

function splitDeploymentFundingError(candidates: FundingCandidate[], remainingScripts: DeploymentPackageScript[]) {
  const largestCell = candidates.reduce((largest, candidate) => (candidate.capacity > largest ? candidate.capacity : largest), BigInt(0));
  const neededForLargestScript = remainingScripts.reduce((needed, script) => {
    const required = requiredDeploymentCapacity([script]);
    return required > needed ? required : needed;
  }, BigInt(0));
  return `JoyID deployment uses single-input transactions, but the current clean CKB cells cannot fit ${remainingScripts.length} script(s). Largest clean cell: ${formatCkb(largestCell)}. Total clean CKB: ${formatCkb(totalCandidateCapacity(candidates))}. Add or consolidate a clean cell of at least ${formatCkb(neededForLargestScript)} and retry.`;
}

function totalCandidateCapacity(candidates: FundingCandidate[]) {
  return candidates.reduce((sum, candidate) => sum + candidate.capacity, BigInt(0));
}

function compareCapacityAsc(left: bigint, right: bigint) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function compareCapacityDesc(left: bigint, right: bigint) {
  return compareCapacityAsc(right, left);
}

function getCellsParams(lock: JoyScript, cursor: string | null): unknown[] {
  const params: unknown[] = [
    {
      script: toRpcScript(lock),
      script_type: "lock",
      filter: {
        output_data_len_range: ["0x0", "0x1"],
      },
      with_data: true,
    },
    "asc",
    "0x64",
  ];
  if (cursor) params.push(cursor);
  return params;
}

async function callCkbRpc<T>(method: string, params: unknown[]): Promise<T> {
  const response = await fetch(ckbRpcURL!, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: Date.now(), jsonrpc: "2.0", method, params }),
  });
  if (!response.ok) {
    throw new Error(`CKB RPC ${method} failed with HTTP ${response.status} at ${ckbRpcURL}. Public CKB endpoints must include /rpc.`);
  }
  const body = (await response.json()) as { result?: T; error?: { message?: string } };
  if (body.error) {
    throw new Error(body.error.message ?? `CKB RPC ${method} failed.`);
  }
  if (body.result === undefined || body.result === null) {
    throw new Error(`CKB RPC ${method} returned no result.`);
  }
  return body.result;
}

function buildDeploymentTransaction(
  deployerLock: JoyScript,
  scripts: DeploymentPackageScript[],
  funding: DeploymentFunding,
  requiredCapacity: bigint,
  joyIdCellDeps: CellDep[],
): CKBTransaction {
  const codeOutputs = scripts.map((script) => ({
    capacity: toHex(scriptCellCapacity(script)),
    lock: deployerLock,
  }));
  const changeCapacity = funding.totalCapacity - requiredCapacity;
  if (changeCapacity < CHANGE_CELL_CKB * SHANNONS_PER_CKB) {
    throw new Error("Funding cells do not leave enough change capacity after deployment.");
  }

  return {
    version: "0x0",
    cellDeps: joyIdCellDeps,
    headerDeps: [],
    inputs: funding.inputs,
    outputs: [
      ...codeOutputs,
      {
        capacity: toHex(changeCapacity),
        lock: deployerLock,
      },
    ],
    outputsData: [...scripts.map((script) => script.data_hex), "0x"],
    witnesses: [emptyWitness(), ...funding.inputs.slice(1).map(() => "0x")],
  };
}

function configuredJoyIdCellDep(): CellDep[] {
  const txHash = JOYID_CELL_DEP_TX_HASH?.trim();
  if (txHash) {
    const depType = JOYID_CELL_DEP_TYPE ?? "code";
    if (depType !== "dep_group" && depType !== "code") {
      throw new Error("NEXT_PUBLIC_JOYID_CELL_DEP_TYPE must be dep_group or code.");
    }
    return [
      {
        outPoint: {
          txHash,
          index: JOYID_CELL_DEP_INDEX,
        },
        depType: depType === "dep_group" ? "depGroup" : "code",
      },
    ];
  }

  if (ckbNetwork === "testnet") return [TESTNET_JOYID_CODE_CELL_DEP];

  if (JOYID_CELL_DEP_TYPE !== undefined && JOYID_CELL_DEP_TYPE !== "dep_group" && JOYID_CELL_DEP_TYPE !== "code") {
    throw new Error("NEXT_PUBLIC_JOYID_CELL_DEP_TYPE must be dep_group or code.");
  }
  return [];
}

async function resolveJoyIdCellDeps(): Promise<CellDep[]> {
  const deps = configuredJoyIdCellDep();
  if (deps.length === 0) {
    throw new Error("Configure NEXT_PUBLIC_JOYID_CELL_DEP_TX_HASH before deploying with JoyID on this network.");
  }

  await assertLiveCellDep(deps[0]);
  return deps;
}

async function assertLiveCellDep(dep: CellDep) {
  const result = await callCkbRpc<GetLiveCellResponse>("get_live_cell", [
    {
      tx_hash: dep.outPoint.txHash,
      index: dep.outPoint.index,
    },
    false,
  ]);
  if (result.status !== "live") {
    throw new Error(`JoyID CKB cell dep ${dep.outPoint.txHash}#${dep.outPoint.index} is ${result.status}. Update NEXT_PUBLIC_JOYID_CELL_DEP_TX_HASH and restart the frontend.`);
  }
}

function assertSignedRawTransactionMatches(unsignedTx: CKBTransaction, signedTx: CKBTransaction) {
  const rawFields = (tx: CKBTransaction) => JSON.stringify({
    cellDeps: tx.cellDeps.map((dep) => ({
      outPoint: {
        txHash: dep.outPoint.txHash,
        index: dep.outPoint.index,
      },
      depType: dep.depType,
    })),
    headerDeps: tx.headerDeps,
    inputs: tx.inputs.map((input) => ({
      previousOutput: {
        txHash: input.previousOutput.txHash,
        index: input.previousOutput.index,
      },
      since: input.since,
    })),
    outputs: tx.outputs.map((output) => ({
      capacity: output.capacity,
      lock: {
        codeHash: output.lock.codeHash,
        hashType: output.lock.hashType,
        args: output.lock.args,
      },
      type: output.type
        ? {
            codeHash: output.type.codeHash,
            hashType: output.type.hashType,
            args: output.type.args,
          }
        : null,
    })),
    outputsData: tx.outputsData,
    version: tx.version,
  });

  if (rawFields(unsignedTx) !== rawFields(signedTx)) {
    throw new Error("JoyID returned a signed transaction with changed raw fields. LiquidLane will not broadcast it because the signature would be invalid.");
  }
}

function requiredDeploymentCapacity(scripts: DeploymentPackageScript[]) {
  return codeCellCapacity(scripts) + deploymentFixedCapacity();
}

function deploymentFixedCapacity() {
  return (CHANGE_CELL_CKB + DEPLOY_FEE_CKB) * SHANNONS_PER_CKB;
}

function codeCellCapacity(scripts: DeploymentPackageScript[]) {
  return scripts.reduce((sum, script) => sum + scriptCellCapacity(script), BigInt(0));
}

function scriptCellCapacity(script: DeploymentPackageScript) {
  return (BigInt(script.size_bytes) + SCRIPT_CELL_OVERHEAD_CKB) * SHANNONS_PER_CKB;
}

function addressToJoyScript(script: { codeHash: string; hashType: string; args: string }): JoyScript {
  if (!isHashType(script.hashType)) {
    throw new Error(`Unsupported CKB hash type: ${script.hashType}`);
  }
  return {
    codeHash: script.codeHash,
    hashType: script.hashType,
    args: script.args || "0x",
  };
}

function toRpcScript(script: JoyScript): RpcScript {
  return {
    code_hash: script.codeHash,
    hash_type: script.hashType,
    args: script.args,
  };
}

function emptyWitness() {
  return serializeWitnessArgs({ lock: "0x", inputType: "0x", outputType: "0x" });
}

function usableDeploymentPopups(options: DeploymentOptions): Window[] {
  const pool = options.popups?.filter(isOpenPopup) ?? [];
  if (pool.length > 0) return pool;
  return isOpenPopup(options.popup) ? [options.popup] : [];
}

function closeUnusedDeploymentPopups(options: DeploymentOptions) {
  for (const popup of options.popups ?? []) {
    closeUnusedPopup(popup);
  }
  closeUnusedPopup(options.popup);
}

function closeUnusedPopup(popup?: JoyIdPopup) {
  if (popup && !popup.closed) {
    popup.close();
  }
}

function isOpenPopup(popup?: JoyIdPopup): popup is Window {
  return Boolean(popup && !popup.closed);
}

function transactionExplorerUrl(txHash: string) {
  return `${EXPLORER_BASE.replace(/\/$/, "")}/transaction/${txHash}`;
}

function formatCkb(shannons: bigint) {
  const whole = shannons / SHANNONS_PER_CKB;
  const fraction = shannons % SHANNONS_PER_CKB;
  if (fraction === BigInt(0)) return `${whole.toLocaleString()} CKB`;
  return `${whole.toLocaleString()}.${fraction.toString().padStart(8, "0").replace(/0+$/, "")} CKB`;
}

function toHex(value: bigint) {
  return `0x${value.toString(16)}`;
}

function isHashType(value: string): value is HashType {
  return value === "type" || value === "data" || value === "data1";
}

export function scriptHash(script: { codeHash: string; hashType: HashType; args: string }) {
  return scriptToHash(script);
}
