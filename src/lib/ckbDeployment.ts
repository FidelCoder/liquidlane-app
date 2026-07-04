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
const JOYID_CELL_DEP_TYPE = process.env.NEXT_PUBLIC_JOYID_CELL_DEP_TYPE ?? "dep_group";

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

type DeploymentInput = {
  previousOutput: {
    txHash: string;
    index: string;
  };
  since: string;
};

type DeploymentFunding = {
  inputs: DeploymentInput[];
  totalCapacity: bigint;
};

export type DeploymentRecordScript = {
  name: string;
  codeHash: string;
  hashType: HashType;
  outputIndex: string;
  outPoint: string;
  explorerUrl: string;
};

export type DeploymentResult = {
  txHash: string;
  explorerUrl: string;
  requiredCkb: string;
  deployedCkb: string;
  scripts: DeploymentRecordScript[];
};

export type DeploymentProgress = "package" | "funding" | "signing" | "broadcast";

export type DeploymentOptions = {
  popup?: JoyIdPopup;
  onProgress?: (step: DeploymentProgress) => void;
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
    const requiredCapacity = requiredDeploymentCapacity(deploymentPackage.scripts);
    options.onProgress?.("funding");
    const funding = await collectFundingCells(deployerLock, requiredCapacity);
    const tx = buildDeploymentTransaction(deployerLock, deploymentPackage.scripts, funding, requiredCapacity);

    options.onProgress?.("signing");
    const signedTx = await signRawCkbTransaction(wallet, tx, [0], options.popup);
    const txToBroadcast = withResolvedJoyIdCellDep(signedTx);
    options.onProgress?.("broadcast");
    const txHash = await broadcastCkbTransaction(txToBroadcast);

    return {
      txHash,
      explorerUrl: transactionExplorerUrl(txHash),
      requiredCkb: formatCkb(requiredCapacity),
      deployedCkb: formatCkb(codeCellCapacity(deploymentPackage.scripts)),
      scripts: deploymentPackage.scripts.map((script, index) => ({
        name: script.name,
        codeHash: script.ckb_data_hash,
        hashType: script.hash_type,
        outputIndex: toHex(BigInt(index)),
        outPoint: `${txHash}#${toHex(BigInt(index))}`,
        explorerUrl: transactionExplorerUrl(txHash),
      })),
    };
  } catch (error) {
    closeUnusedPopup(options.popup);
    throw error;
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

async function collectFundingCells(lock: JoyScript, requiredCapacity: bigint): Promise<DeploymentFunding> {
  if (!ckbRpcURL?.trim()) {
    throw new Error("NEXT_PUBLIC_CKB_RPC_URL is required for testnet deployment.");
  }

  const inputs: DeploymentInput[] = [];
  let totalCapacity = BigInt(0);
  let cursor: string | null = null;

  for (let round = 0; round < MAX_COLLECTION_ROUNDS && totalCapacity < requiredCapacity; round += 1) {
    const result: GetCellsResponse = await callCkbRpc<GetCellsResponse>("get_cells", getCellsParams(lock, cursor));
    for (const cell of result.objects) {
      if (cell.output.type) continue;
      if ((cell.output_data ?? "0x") !== "0x") continue;
      inputs.push({
        previousOutput: {
          txHash: cell.out_point.tx_hash,
          index: cell.out_point.index,
        },
        since: "0x0",
      });
      totalCapacity += BigInt(cell.output.capacity);
      if (totalCapacity >= requiredCapacity) break;
    }
    if (!result.objects.length || cursor === result.last_cursor) break;
    cursor = result.last_cursor;
  }

  if (totalCapacity < requiredCapacity) {
    throw new Error(`Fund JoyID with at least ${formatCkb(requiredCapacity)} for script deployment. Found ${formatCkb(totalCapacity)} spendable CKB.`);
  }

  return { inputs, totalCapacity };
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
    throw new Error(`CKB RPC ${method} failed with HTTP ${response.status}.`);
  }
  const body = (await response.json()) as { result?: T; error?: { message?: string } };
  if (body.error) {
    throw new Error(body.error.message ?? `CKB RPC ${method} failed.`);
  }
  if (!body.result) {
    throw new Error(`CKB RPC ${method} returned no result.`);
  }
  return body.result;
}

function buildDeploymentTransaction(
  deployerLock: JoyScript,
  scripts: DeploymentPackageScript[],
  funding: DeploymentFunding,
  requiredCapacity: bigint,
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
    cellDeps: configuredJoyIdCellDep(),
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
  if (!JOYID_CELL_DEP_TX_HASH?.trim()) return [];
  if (JOYID_CELL_DEP_TYPE !== "dep_group" && JOYID_CELL_DEP_TYPE !== "code") {
    throw new Error("NEXT_PUBLIC_JOYID_CELL_DEP_TYPE must be dep_group or code.");
  }
  return [
    {
      outPoint: {
        txHash: JOYID_CELL_DEP_TX_HASH.trim(),
        index: JOYID_CELL_DEP_INDEX,
      },
      depType: JOYID_CELL_DEP_TYPE === "dep_group" ? "depGroup" : "code",
    },
  ];
}

function withResolvedJoyIdCellDep(tx: CKBTransaction): CKBTransaction {
  if (tx.cellDeps.length > 0) return tx;
  const deps = configuredJoyIdCellDep();
  if (deps.length > 0) {
    return { ...tx, cellDeps: deps };
  }
  throw new Error(
    "JoyID returned no CKB cell dep for raw signing. Set NEXT_PUBLIC_JOYID_CELL_DEP_TX_HASH to the current JoyID testnet dep out-point from Pudge explorer.",
  );
}

function requiredDeploymentCapacity(scripts: DeploymentPackageScript[]) {
  return codeCellCapacity(scripts) + CHANGE_CELL_CKB * SHANNONS_PER_CKB + DEPLOY_FEE_CKB * SHANNONS_PER_CKB;
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

function closeUnusedPopup(popup?: JoyIdPopup) {
  if (popup && !popup.closed) {
    popup.close();
  }
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
