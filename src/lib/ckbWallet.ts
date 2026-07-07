import {
  connect,
  getCotaCellDep,
  getSubkeyUnlock,
  initConfig,
  openPopup,
  signChallenge as joySignChallenge,
  signRawTransaction as joySignRawTransaction,
  signTransaction as joySignTransaction,
  type CKBTransaction,
  type ConnectResponseData,
  type SignChallengeResponseData,
} from "@joyid/ckb";
import { addressToScript, serializeWitnessArgs } from "@nervosnetwork/ckb-sdk-utils";

export type CkbLockScript = {
  code_hash: string;
  hash_type: string;
  args: string;
};

export type ConnectedCkbWallet = {
  ckbAddress: string;
  walletType: "joyid_ckb";
  lockScript: CkbLockScript;
  joyIdConnection: ConnectResponseData;
};

export type CkbWalletProof = ConnectedCkbWallet & {
  signature: string;
};

export type JoyIdPopup = Window | null;

export const ckbNetwork = (process.env.NEXT_PUBLIC_CKB_NETWORK === "mainnet" ? "mainnet" : "testnet") as
  | "mainnet"
  | "testnet";

const joyidAppURL = process.env.NEXT_PUBLIC_JOYID_APP_URL ?? (ckbNetwork === "mainnet" ? "https://app.joy.id" : "https://testnet.joyid.dev");
const joyidServerURL = process.env.NEXT_PUBLIC_JOYID_SERVER_URL ?? (ckbNetwork === "mainnet" ? "https://api.joy.id/api/v1" : "https://api.testnet.joyid.dev/api/v1");
const joyidAggregatorURL = process.env.NEXT_PUBLIC_JOYID_AGGREGATOR_URL ?? (ckbNetwork === "mainnet" ? "https://cota.nervina.dev/mainnet-aggregator" : "https://cota.nervina.dev/aggregator");
export const ckbRpcURL = normalizeCkbRpcURL(process.env.NEXT_PUBLIC_CKB_RPC_URL);

const JOYID_SIGN_TIMEOUT_SECONDS = 120;
const JOYID_POPUP_POLL_MS = 500;
const CKB_RPC_TIMEOUT_MS = 45_000;

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
  showJoyIdPopupStatus(popup, "Opening JoyID", "Review the CKB vault transaction and confirm the signature.");

  const txToSign = await prepareJoyIdRawTransaction(wallet, tx, witnessIndexes, popup);
  try {
    const signedTx = await awaitJoyIdPopup(
      joySignRawTransaction(txToSign, wallet.ckbAddress, {
        name: "LiquidLane",
        network: ckbNetwork,
        joyidAppURL,
        joyidServerURL,
        rpcURL: ckbRpcURL,
        popup: popup ?? undefined,
        timeoutInSeconds: JOYID_SIGN_TIMEOUT_SECONDS,
        witnessIndexes,
      }),
      popup,
      JOYID_SIGN_TIMEOUT_SECONDS,
      "JoyID CKB signing",
    );
    if (!signedTx || !Array.isArray(signedTx.witnesses)) {
      throw new Error("JoyID did not return a signed CKB transaction.");
    }
    assertSignedSpendMatches(txToSign, signedTx);
    const normalizedTx = normalizeJoyIdSignedWitness(wallet, signedTx, witnessIndexes[0] ?? 0);
    assertSignedJoyIdWitness(normalizedTx, witnessIndexes[0] ?? 0);
    return normalizedTx;
  } catch (error) {
    const message = normalizeJoyIdSigningError(error);
    showJoyIdPopupStatus(popup, "Signing failed", message);
    throw new Error(message);
  }
}

export async function signJoyIdSdkTransferProbe(
  wallet: ConnectedCkbWallet,
  recipientAddress: string,
  amountCkb: string,
  popup?: JoyIdPopup,
): Promise<CKBTransaction> {
  configureJoyID();
  showJoyIdPopupStatus(popup, "JoyID SDK probe", "Sign a JoyID-built transfer. LiquidLane will only dry-run it.");

  const signedTx = await awaitJoyIdPopup(
    joySignTransaction(
      {
        from: wallet.ckbAddress,
        to: recipientAddress,
        amount: amountCkb,
      },
      {
        name: "LiquidLane",
        network: ckbNetwork,
        joyidAppURL,
        joyidServerURL,
        rpcURL: ckbRpcURL,
        popup: popup ?? undefined,
        timeoutInSeconds: JOYID_SIGN_TIMEOUT_SECONDS,
      },
    ),
    popup,
    JOYID_SIGN_TIMEOUT_SECONDS,
    "JoyID SDK transfer signing",
  );
  if (!signedTx || !Array.isArray(signedTx.witnesses)) {
    throw new Error("JoyID SDK did not return a signed CKB transaction.");
  }
  return signedTx;
}
function awaitJoyIdPopup<T>(promise: Promise<T>, popup: JoyIdPopup | undefined, timeoutSeconds: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeoutId = setTimeout(() => {
      finish(() => reject(new Error(`${label} timed out after ${timeoutSeconds} seconds. Close JoyID and try again.`)));
      closePopup(popup);
    }, timeoutSeconds * 1000);
    const pollId = popup ? setInterval(() => {
      if (popup.closed) {
        finish(() => reject(new Error(`${label} popup closed before a signature was returned.`)));
      }
    }, JOYID_POPUP_POLL_MS) : undefined;

    function finish(action: () => void) {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      if (pollId) clearInterval(pollId);
      action();
    }

    promise.then(
      (value) => finish(() => resolve(value)),
      (error) => finish(() => reject(error)),
    );
  });
}

function closePopup(popup: JoyIdPopup | undefined) {
  try {
    if (popup && !popup.closed) popup.close();
  } catch {
    // Cross-origin popups may reject close checks in some browsers.
  }
}

function normalizeJoyIdSigningError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "JoyID signing failed.");
  if (/popup closed/i.test(message)) {
    return "JoyID signing was closed before LiquidLane received a signature. No transaction was broadcast.";
  }
  if (/timed out|timeout/i.test(message)) {
    return "JoyID signing timed out before LiquidLane received a signature. No transaction was broadcast.";
  }
  if (/invalid ckb address format/i.test(message)) {
    return "JoyID rejected the CKB signer address format. Disconnect, reconnect JoyID on CKB testnet, and retry. No transaction was broadcast.";
  }
  if (/cancel|reject|denied/i.test(message)) {
    return "JoyID signing was cancelled. No transaction was broadcast.";
  }
  return message;
}

async function prepareJoyIdRawTransaction(
  wallet: ConnectedCkbWallet,
  tx: CKBTransaction,
  witnessIndexes: number[],
  popup?: JoyIdPopup,
): Promise<CKBTransaction> {
  const preparedTx = cloneTransaction(tx);
  const firstWitnessIndex = witnessIndexes[0] ?? 0;
  preparedTx.witnesses[firstWitnessIndex] ??= serializeWitnessArgs({ lock: "0x", inputType: "0x", outputType: "0x" });

  if (!isJoyIdSubKey(wallet)) {
    await attachJoyIdOutputMetadata(preparedTx, wallet, firstWitnessIndex);
    return preparedTx;
  }

  showJoyIdPopupStatus(popup, "Preparing JoyID unlock", "Fetching JoyID sub-key proof before signing this CKB transaction.");
  const unlockEntry = await getSubkeyUnlock(joyidAggregatorURL, wallet.joyIdConnection);
  prependCellDep(preparedTx, getCotaCellDep(ckbNetwork === "mainnet"));
  const witnessArgs = deserializeWitnessArgsHex(preparedTx.witnesses[firstWitnessIndex]);
  preparedTx.witnesses[firstWitnessIndex] = serializeWitnessArgs({
    lock: witnessArgs.lock,
    inputType: witnessArgs.inputType,
    outputType: unlockEntry,
  });

  return preparedTx;
}

async function attachJoyIdOutputMetadata(tx: CKBTransaction, wallet: ConnectedCkbWallet, firstWitnessIndex: number) {
  const userLock = addressToScript(wallet.ckbAddress);
  const joyIdOutputs = tx.outputs
    .map((output, index) => ({ output, index }))
    .filter(({ output }) => sameScript(output.lock, userLock));
  if (!joyIdOutputs.length) return;

  const credential = await fetchJoyIdCredential(wallet);
  const metadataWitnesses = joyIdOutputs.map(({ index }) => joyIdMetadataHex(credential, index));
  const firstWitness = deserializeWitnessArgsHex(tx.witnesses[firstWitnessIndex]);
  tx.witnesses[firstWitnessIndex] = serializeWitnessArgs({
    lock: firstWitness.lock,
    inputType: firstWitness.inputType,
    outputType: metadataWitnesses[0],
  });

  for (const metadata of metadataWitnesses.slice(1)) {
    tx.witnesses.push(serializeWitnessArgs({ lock: "0x", inputType: "0x", outputType: metadata }));
  }
}

type JoyIdCredential = {
  id: string;
  name?: string;
  user_name?: string;
  public_key: string;
  alg: number;
  key_type: string;
  ckb_address: string;
  cota_cell_id?: string;
};

async function fetchJoyIdCredential(wallet: ConnectedCkbWallet): Promise<JoyIdCredential> {
  const response = await fetch(joyidServerURL.replace(/\/$/, "") + "/credentials/" + wallet.ckbAddress);
  if (!response.ok) {
    throw new Error("JoyID credential lookup failed with HTTP " + response.status + ".");
  }
  const body = (await response.json()) as { credentials?: JoyIdCredential[] };
  const credentials = body.credentials ?? [];
  const walletPubkey = normalizeCredentialPubkey(wallet.joyIdConnection.pubkey);
  const keyType = wallet.joyIdConnection.keyType;
  const credential = credentials.find((item) =>
    item.ckb_address === wallet.ckbAddress &&
    item.key_type === keyType &&
    normalizeCredentialPubkey(item.public_key) === walletPubkey,
  ) ?? credentials.find((item) => item.ckb_address === wallet.ckbAddress && item.key_type === keyType);

  if (!credential) {
    throw new Error("JoyID credential metadata was not found for this wallet. Reconnect JoyID and retry supply.");
  }
  return credential;
}

function joyIdMetadataHex(credential: JoyIdCredential, outputIndex: number) {
  const metadata = {
    id: "CTMeta",
    ver: "1.0",
    metadata: {
      target: "output#" + outputIndex,
      type: "joy_id",
      data: {
        alg: joyIdAlgHex(credential.alg),
        cotaCellId: credential.cota_cell_id ?? "0x0000000000000000",
        credentialId: credentialIdHex(credential.id),
        front_end: joyIdFrontendHost(),
        name: credential.user_name ?? credential.name ?? "JoyID",
        pub_key: "0x" + normalizeCredentialPubkey(credential.public_key),
        version: "0",
      },
    },
  };
  return stringToHex(JSON.stringify(metadata));
}

function joyIdAlgHex(alg: number) {
  if (alg === -7) return "0x01";
  if (alg === -257) return "0x02";
  return "0x" + Math.max(0, alg).toString(16).padStart(2, "0");
}

function credentialIdHex(id: string) {
  if (/^0x[0-9a-fA-F]+$/.test(id)) return id;
  const normalized = id.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return "0x" + Array.from(binary, (char) => char.charCodeAt(0).toString(16).padStart(2, "0")).join("");
}

function normalizeCredentialPubkey(value: string) {
  const clean = value.replace(/^0x/, "").toLowerCase();
  return clean.length === 130 && clean.startsWith("04") ? clean.slice(2) : clean;
}

function joyIdFrontendHost() {
  try {
    return new URL(joyidAppURL).hostname;
  } catch {
    return ckbNetwork === "mainnet" ? "app.joy.id" : "testnet.joyid.dev";
  }
}

function stringToHex(value: string) {
  return "0x" + Array.from(new TextEncoder().encode(value), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function sameScript(left: { codeHash: string; hashType: string; args: string }, right: { codeHash: string; hashType: string; args: string }) {
  return left.codeHash.toLowerCase() === right.codeHash.toLowerCase() &&
    left.hashType === right.hashType &&
    left.args.toLowerCase() === right.args.toLowerCase();
}

function isJoyIdSubKey(wallet: ConnectedCkbWallet) {
  return wallet.joyIdConnection.keyType === "sub_key";
}

function normalizeJoyIdSignedWitness(_wallet: ConnectedCkbWallet, tx: CKBTransaction, _witnessIndex: number) {
  return tx;
}

export function joyIdTxDiagnostics(wallet: ConnectedCkbWallet, tx: CKBTransaction, witnessIndex = 0): string[] {
  const witness = tx.witnesses[witnessIndex] ?? "0x";
  const witnessArgs = deserializeWitnessArgsHex(witness);
  const joyDeps = tx.cellDeps.map((dep) => `${dep.outPoint.txHash}#${dep.outPoint.index}:${dep.depType}`);
  const lockMode = witnessArgs.lock.length >= 4 ? `0x${witnessArgs.lock.slice(2, 4)}` : "0x";
  const addressLock = addressToScript(wallet.ckbAddress);
  const lockArgs = addressLock.args || "0x";
  return [
    `JoyID keyType: ${wallet.joyIdConnection.keyType ?? "unknown"}`,
    `JoyID address lock: ${addressLock.codeHash}:${addressLock.hashType}`,
    `JoyID lock args prefix: ${lockArgs.slice(0, 10)} (${byteLength(lockArgs)} bytes)`,
    `Witness index: ${witnessIndex}`,
    `Witness lock mode: ${lockMode}`,
    `Witness lock bytes: ${byteLength(witnessArgs.lock)}`,
    `Witness inputType bytes: ${byteLength(witnessArgs.inputType)}`,
    `Witness outputType bytes: ${byteLength(witnessArgs.outputType)}`,
    `Inputs / witnesses: ${tx.inputs.length} / ${tx.witnesses.length}`,
    `Cell deps: ${joyDeps.join(", ")}`,
  ];
}

function assertSignedSpendMatches(unsignedTx: CKBTransaction, signedTx: CKBTransaction) {
  if (spendFingerprint(unsignedTx) !== spendFingerprint(signedTx)) {
    throw new Error("JoyID returned a signed transaction with changed inputs or outputs. LiquidLane will not broadcast it.");
  }
}

function spendFingerprint(tx: CKBTransaction) {
  return JSON.stringify({
    inputs: tx.inputs.map((input) => ({
      previousOutput: { txHash: input.previousOutput.txHash, index: input.previousOutput.index },
      since: input.since,
    })),
    outputs: tx.outputs.map((output) => ({
      capacity: output.capacity,
      lock: output.lock,
      type: output.type ?? null,
    })),
    outputsData: tx.outputsData,
    version: tx.version,
  });
}

function prependCellDep(tx: CKBTransaction, dep: CKBTransaction["cellDeps"][number]) {
  const exists = tx.cellDeps.some((cellDep) =>
    cellDep.outPoint.txHash === dep.outPoint.txHash &&
    cellDep.outPoint.index === dep.outPoint.index &&
    cellDep.depType === dep.depType,
  );
  if (!exists) tx.cellDeps.unshift(dep);
}

function assertSignedJoyIdWitness(tx: CKBTransaction, witnessIndex: number) {
  const witness = tx.witnesses[witnessIndex];
  if (!witness) {
    throw new Error("JoyID returned no signed witness for the CKB input.");
  }
  const witnessArgs = deserializeWitnessArgsHex(witness);
  if (!witnessArgs.lock || witnessArgs.lock === "0x") {
    throw new Error("JoyID returned a CKB witness without a lock signature.");
  }
}

type WitnessArgsHex = {
  lock: string;
  inputType: string;
  outputType: string;
};

function deserializeWitnessArgsHex(witness: string): WitnessArgsHex {
  if (!witness || witness === "0x") {
    return { lock: "0x", inputType: "0x", outputType: "0x" };
  }

  const clean = strip0x(witness);
  if (clean.length < 32) {
    return { lock: "0x", inputType: "0x", outputType: "0x" };
  }

  const lockOffset = readLeU32(clean.slice(8, 16)) * 2;
  const inputTypeOffset = readLeU32(clean.slice(16, 24)) * 2;
  const outputTypeOffset = readLeU32(clean.slice(24, 32)) * 2;

  return {
    lock: moleculeBytes(clean.slice(lockOffset, inputTypeOffset)),
    inputType: moleculeBytes(clean.slice(inputTypeOffset, outputTypeOffset)),
    outputType: moleculeBytes(clean.slice(outputTypeOffset)),
  };
}

function moleculeBytes(section: string) {
  if (section.length < 8) return "0x";
  const body = section.slice(8);
  return body ? `0x${body}` : "0x";
}

function byteLength(hex: string) {
  const clean = strip0x(hex || "0x");
  return clean.length / 2;
}

function readLeU32(hex: string) {
  const bytes = hex.match(/../g) ?? [];
  return bytes.reduce((value, byte, index) => value + Number.parseInt(byte, 16) * 256 ** index, 0);
}

function strip0x(value: string) {
  return value.startsWith("0x") ? value.slice(2) : value;
}

export async function dryRunCkbTransaction(tx: CKBTransaction): Promise<void> {
  assertRpcTransactionReady(tx, "dry-run");
  await callCkbRpcForTransaction<{ cycles?: string }>(
    "dry_run_transaction",
    [toRpcTransaction(tx)],
    tx,
    "CKB dry-run",
  );
}

export async function broadcastCkbTransaction(tx: CKBTransaction): Promise<string> {
  assertRpcTransactionReady(tx, "broadcast");
  return callCkbRpcForTransaction<string>(
    "send_transaction",
    [toRpcTransaction(tx), "passthrough"],
    tx,
    "CKB broadcast",
  );
}

type CkbRpcError = {
  code?: number;
  message?: string;
  data?: unknown;
};

type CkbRpcResponse<T> = {
  result?: T;
  error?: CkbRpcError;
};

async function callCkbRpcForTransaction<T>(method: string, params: unknown[], tx: CKBTransaction, label: string): Promise<T> {
  if (!ckbRpcURL?.trim()) {
    throw new Error("CKB RPC URL is not configured for supply transactions.");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CKB_RPC_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(ckbRpcURL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: Date.now(), jsonrpc: "2.0", method, params }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`${label} timed out after ${CKB_RPC_TIMEOUT_MS / 1000} seconds. No transaction was broadcast.`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw new Error(`${label} failed with HTTP ${response.status} at ${ckbRpcURL}.`);
  }

  const body = (await response.json()) as CkbRpcResponse<T>;
  if (body.error) {
    throw new Error(formatCkbRpcError(label, body.error, tx));
  }
  if (body.result === undefined || body.result === null) {
    throw new Error(`${label} returned no result from CKB RPC.`);
  }
  return body.result;
}

function assertRpcTransactionReady(tx: CKBTransaction, action: string) {
  if (!tx.inputs.length) {
    throw new Error(`Cannot ${action} a CKB transaction with no inputs.`);
  }
  if (!tx.outputs.length) {
    throw new Error(`Cannot ${action} a CKB transaction with no outputs.`);
  }
  if (tx.outputs.length !== tx.outputsData.length) {
    throw new Error(`Cannot ${action} CKB transaction because outputs and outputsData lengths differ.`);
  }
  if (!tx.witnesses.length) {
    throw new Error(`Cannot ${action} a CKB transaction with no witnesses.`);
  }
}

function formatCkbRpcError(label: string, error: CkbRpcError, tx: CKBTransaction) {
  const message = error.message?.trim() || "CKB RPC rejected the transaction.";
  const code = error.code === undefined ? "" : ` code=${error.code}.`;
  const source = rpcSourceHint(message, tx);
  const data = error.data === undefined ? "" : ` Data: ${shortJson(error.data)}`;
  return `${label} rejected the transaction:${code} ${message}${source}${data}`;
}

function rpcSourceHint(message: string, tx: CKBTransaction) {
  const inputMatch = message.match(/Inputs\[(\d+)\]\.(Lock|Type)/i);
  if (inputMatch) {
    const index = Number(inputMatch[1]);
    const input = tx.inputs[index];
    if (input) {
      return ` Source input ${index} ${inputMatch[2]} spends ${input.previousOutput.txHash}#${input.previousOutput.index}.`;
    }
  }

  const outputMatch = message.match(/Outputs\[(\d+)\]\.(Lock|Type)/i);
  if (outputMatch) {
    const index = Number(outputMatch[1]);
    const output = tx.outputs[index];
    if (output) {
      const script = outputMatch[2].toLowerCase() === "type" ? output.type : output.lock;
      return script ? ` Source output ${index} ${outputMatch[2]} uses ${script.codeHash}.` : ` Source output ${index} has no type script.`;
    }
  }

  return "";
}

function shortJson(value: unknown) {
  try {
    const text = JSON.stringify(value);
    return text.length > 700 ? `${text.slice(0, 700)}...` : text;
  } catch {
    return String(value);
  }
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
    lockScript: toBackendScript(addressToScript(ckbAddress)),
    joyIdConnection: connection,
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
