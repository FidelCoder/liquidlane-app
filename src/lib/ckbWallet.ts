import {
  connect,
  getJoyIDLockScript,
  initConfig,
  openPopup,
  signChallenge,
  signRawTransaction,
  signTransaction,
  type CKBTransaction,
  type ConnectResponseData,
  type SignChallengeResponseData,
} from "@joyid/ckb";

export type CkbLockScript = {
  code_hash: string;
  hash_type: string;
  args: string;
};

export type ConnectedCkbWallet = {
  ckbAddress: string;
  walletType: "joyid_ckb";
  lockScript: CkbLockScript;
};

export type CkbWalletProof = ConnectedCkbWallet & {
  signature: string;
};

export type SupplyTransactionRequest = {
  asset: string;
  amount: number;
  to: string;
  memo?: string;
};

export type SignedSupplyTransaction = {
  tx: CKBTransaction;
  txHash: string | null;
  memo: string;
};

export type JoyIdPopup = Window | null;

export const ckbNetwork = (process.env.NEXT_PUBLIC_CKB_NETWORK === "mainnet" ? "mainnet" : "testnet") as
  | "mainnet"
  | "testnet";

const joyidAppURL = process.env.NEXT_PUBLIC_JOYID_APP_URL ?? (ckbNetwork === "mainnet" ? "https://app.joy.id" : "https://testnet.joyid.dev");
const joyidServerURL = process.env.NEXT_PUBLIC_JOYID_SERVER_URL ?? (ckbNetwork === "mainnet" ? "https://api.joy.id/api/v1" : "https://api.testnet.joyid.dev/api/v1");
export const ckbRpcURL = process.env.NEXT_PUBLIC_CKB_RPC_URL;

export async function connectCkbWallet(): Promise<ConnectedCkbWallet> {
  configureJoyID();

  const connection = await connect({
    name: "LiquidLane",
    network: ckbNetwork,
    joyidAppURL,
    joyidServerURL,
    rpcURL: ckbRpcURL,
  });

  return walletFromConnection(connection);
}

export async function signCkbChallenge(challengeMessage: string, wallet: ConnectedCkbWallet): Promise<CkbWalletProof> {
  configureJoyID();

  const signed = await signChallenge(challengeMessage, wallet.ckbAddress, {
    name: "LiquidLane",
    network: ckbNetwork,
    joyidAppURL,
    joyidServerURL,
    rpcURL: ckbRpcURL,
  });

  return {
    ...wallet,
    signature: encodeSignatureProof(signed),
  };
}

export async function signSupplyTransaction(
  wallet: ConnectedCkbWallet,
  request: SupplyTransactionRequest,
): Promise<SignedSupplyTransaction> {
  configureJoyID();

  const asset = request.asset.trim().toUpperCase();
  if (asset !== "CKB") {
    throw new Error("Direct wallet supply is currently enabled for CKB vault transactions.");
  }
  if (!request.to.trim()) {
    throw new Error("Vault CKB address is not configured.");
  }
  if (!Number.isFinite(request.amount) || request.amount <= 0) {
    throw new Error("Supply amount must be greater than zero.");
  }

  const memo = request.memo?.trim() || `LiquidLane supply ${asset} ${request.amount} from ${wallet.ckbAddress}`;
  const tx = await signTransaction(
    {
      from: wallet.ckbAddress,
      to: request.to.trim(),
      amount: String(request.amount),
      data: memo,
    },
    {
      name: "LiquidLane",
      network: ckbNetwork,
      joyidAppURL,
      joyidServerURL,
      rpcURL: ckbRpcURL,
      timeoutInSeconds: 120,
    },
  );
  const txHash = await broadcastCkbTransaction(tx);

  return {
    tx: { ...tx, hash: txHash },
    txHash,
    memo,
  };
}


export function openJoyIdPopup(): JoyIdPopup {
  configureJoyID();
  return openPopup("");
}

export async function signRawCkbTransaction(
  wallet: ConnectedCkbWallet,
  tx: CKBTransaction,
  witnessIndexes = [0],
  popup?: JoyIdPopup,
): Promise<CKBTransaction> {
  configureJoyID();

  return signRawTransaction(tx, wallet.ckbAddress, {
    name: "LiquidLane",
    network: ckbNetwork,
    joyidAppURL,
    joyidServerURL,
    rpcURL: ckbRpcURL,
    witnessIndexes,
    popup: popup ?? undefined,
    timeoutInSeconds: 300,
  });
}

export async function broadcastCkbTransaction(tx: CKBTransaction): Promise<string> {
  if (!ckbRpcURL?.trim()) {
    throw new Error("CKB RPC URL is not configured for broadcasting supply transactions.");
  }

  const response = await fetch(ckbRpcURL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: Date.now(),
      jsonrpc: "2.0",
      method: "send_transaction",
      params: [toRpcTransaction(tx), "passthrough"],
    }),
  });
  if (!response.ok) {
    throw new Error(`CKB RPC rejected the transaction with HTTP ${response.status}.`);
  }

  const body = (await response.json()) as { result?: string; error?: { message?: string } };
  if (body.error) {
    throw new Error(body.error.message ?? "CKB RPC rejected the transaction.");
  }
  if (!body.result) {
    throw new Error("CKB RPC did not return a transaction hash.");
  }
  return body.result;
}

type RpcScript = {
  code_hash: string;
  hash_type: string;
  args: string;
};

function toRpcTransaction(tx: CKBTransaction) {
  return {
    version: tx.version,
    cell_deps: tx.cellDeps.map((dep) => ({
      out_point: {
        tx_hash: dep.outPoint.txHash,
        index: dep.outPoint.index,
      },
      dep_type: dep.depType === "depGroup" ? "dep_group" : dep.depType,
    })),
    header_deps: tx.headerDeps,
    inputs: tx.inputs.map((input) => ({
      previous_output: {
        tx_hash: input.previousOutput.txHash,
        index: input.previousOutput.index,
      },
      since: input.since,
    })),
    outputs: tx.outputs.map((output) => ({
      capacity: output.capacity,
      lock: toRpcScript(output.lock),
      ...(output.type ? { type: toRpcScript(output.type) } : {}),
    })),
    outputs_data: tx.outputsData,
    witnesses: tx.witnesses,
  };
}

function toRpcScript(script: { codeHash: string; hashType: string; args: string }): RpcScript {
  return {
    code_hash: script.codeHash,
    hash_type: script.hashType,
    args: script.args,
  };
}

function configureJoyID() {
  initConfig({
    name: "LiquidLane",
    network: ckbNetwork,
    joyidAppURL,
    joyidServerURL,
    rpcURL: ckbRpcURL,
  });
}

function walletFromConnection(connection: ConnectResponseData): ConnectedCkbWallet {
  const ckbAddress = pickAddress(connection);
  return {
    ckbAddress,
    walletType: "joyid_ckb",
    lockScript: toBackendScript(getJoyIDLockScript(ckbNetwork === "mainnet")),
  };
}

function pickAddress(connection: ConnectResponseData): string {
  const address = connection.address?.trim();
  if (!address) {
    throw new Error("JoyID did not return a CKB address.");
  }
  return address;
}

function encodeSignatureProof(signed: SignChallengeResponseData): string {
  return JSON.stringify({
    signature: signed.signature,
    message: signed.message,
    pubkey: signed.pubkey,
    challenge: signed.challenge,
    keyType: signed.keyType,
    alg: signed.alg,
  });
}

function toBackendScript(script: { codeHash: string; hashType: string; args: string }): CkbLockScript {
  return {
    code_hash: script.codeHash,
    hash_type: script.hashType,
    args: script.args || "0x",
  };
}
