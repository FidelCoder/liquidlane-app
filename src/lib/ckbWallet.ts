import {
  connect,
  getJoyIDLockScript,
  initConfig,
  openPopup,
  signChallenge as joySignChallenge,
  signRawTransaction as joySignRawTransaction,
  signTransaction,
  type CKBTransaction,
  type ConnectResponseData,
  type SignChallengeResponseData,
} from "@joyid/ckb";
import { serializeWitnessArgs } from "@nervosnetwork/ckb-sdk-utils";

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
export const ckbRpcURL = normalizeCkbRpcURL(process.env.NEXT_PUBLIC_CKB_RPC_URL);

export async function connectCkbWallet(popup?: JoyIdPopup): Promise<ConnectedCkbWallet> {
  configureJoyID();

  const connection = await connect({
    name: "LiquidLane",
    network: ckbNetwork,
    joyidAppURL,
    joyidServerURL,
    rpcURL: ckbRpcURL,
    popup: popup ?? undefined,
    timeoutInSeconds: 300,
  });

  return walletFromConnection(connection);
}

export async function signCkbChallenge(challengeMessage: string, wallet: ConnectedCkbWallet): Promise<CkbWalletProof> {
  configureJoyID();

  const signed = await joySignChallenge(challengeMessage, wallet.ckbAddress, {
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
  popup?: JoyIdPopup,
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
      popup: popup ?? undefined,
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

export function showJoyIdPopupStatus(popup: JoyIdPopup | undefined, title: string, detail: string) {
  if (!popup || popup.closed) return;
  try {
    popup.document.open();
    popup.document.write(popupStatusHtml(title, detail));
    popup.document.close();
  } catch {
    // The popup may already be cross-origin after JoyID navigation starts.
  }
}

export async function signRawCkbTransaction(
  wallet: ConnectedCkbWallet,
  tx: CKBTransaction,
  witnessIndexes = [0],
  popup?: JoyIdPopup,
): Promise<CKBTransaction> {
  configureJoyID();
  showJoyIdPopupStatus(popup, "Opening JoyID", "Review the CKB transaction and confirm the signature.");

  return joySignRawTransaction(tx, wallet.ckbAddress, {
    name: "LiquidLane",
    network: ckbNetwork,
    joyidAppURL,
    joyidServerURL,
    rpcURL: ckbRpcURL,
    popup: popup ?? undefined,
    timeoutInSeconds: 300,
    witnessIndexes,
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

function buildJoyIdSignedTx(
  unsignedTx: CKBTransaction,
  signedData: SignChallengeResponseData,
  witnessIndexes: number[],
): CKBTransaction {
  const firstWitnessIndex = witnessIndexes[0] ?? 0;
  const mode = signedData.keyType.startsWith("sub") ? "02" : "01";
  const lock = `0x${mode}${signedData.pubkey}${signedData.signature}${signedData.message}`;
  unsignedTx.witnesses[firstWitnessIndex] = serializeWitnessArgs({ lock, inputType: "0x", outputType: "0x" });
  return unsignedTx;
}

function cloneTransaction(tx: CKBTransaction): CKBTransaction {
  return {
    ...tx,
    cellDeps: tx.cellDeps.map((dep) => ({
      depType: dep.depType,
      outPoint: { ...dep.outPoint },
    })),
    headerDeps: [...tx.headerDeps],
    inputs: tx.inputs.map((input) => ({
      since: input.since,
      previousOutput: { ...input.previousOutput },
    })),
    outputs: tx.outputs.map((output) => ({
      ...output,
      lock: { ...output.lock },
      ...(output.type ? { type: { ...output.type } } : {}),
    })),
    outputsData: [...tx.outputsData],
    witnesses: [...tx.witnesses],
  };
}

function hexToBytes(hex: string) {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) {
    throw new Error("JoyID raw transaction challenge must be even-length hex.");
  }
  const bytes = new Uint8Array(clean.length / 2);
  for (let index = 0; index < clean.length; index += 2) {
    bytes[index / 2] = Number.parseInt(clean.slice(index, index + 2), 16);
  }
  return bytes;
}

function popupStatusHtml(title: string, detail: string) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: dark; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #08110f; color: #f2fbf7; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    main { width: min(360px, calc(100vw - 40px)); }
    .mark { width: 42px; height: 42px; border: 1px solid #7ee7b8; border-radius: 10px; display: grid; place-items: center; margin-bottom: 18px; color: #7ee7b8; }
    .spinner { width: 18px; height: 18px; border: 2px solid rgba(126, 231, 184, .25); border-top-color: #7ee7b8; border-radius: 50%; animation: spin .8s linear infinite; }
    h1 { font-size: 21px; line-height: 1.2; margin: 0 0 10px; }
    p { color: #a8bdb4; line-height: 1.5; margin: 0; }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <main>
    <div class="mark"><div class="spinner"></div></div>
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(detail)}</p>
  </main>
</body>
</html>`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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

function normalizeCkbRpcURL(value?: string) {
  const fallback = ckbNetwork === "mainnet" ? "https://mainnet.ckb.dev/rpc" : "https://testnet.ckb.dev/rpc";
  const rawUrl = value?.trim() || fallback;
  try {
    const url = new URL(rawUrl);
    const isPublicCkbDev = url.hostname === "mainnet.ckb.dev" || url.hostname === "testnet.ckb.dev";
    if (isPublicCkbDev && (url.pathname === "" || url.pathname === "/" || url.pathname === "/rpc/")) {
      url.pathname = "/rpc";
    }
    return url.toString();
  } catch {
    return rawUrl;
  }
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
