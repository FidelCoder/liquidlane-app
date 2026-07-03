import {
  connect,
  getJoyIDLockScript,
  initConfig,
  signChallenge,
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

const network = (process.env.NEXT_PUBLIC_CKB_NETWORK === "mainnet" ? "mainnet" : "testnet") as
  | "mainnet"
  | "testnet";

const joyidAppURL = process.env.NEXT_PUBLIC_JOYID_APP_URL ?? (network === "mainnet" ? "https://app.joy.id" : "https://testnet.joyid.dev");
const joyidServerURL = process.env.NEXT_PUBLIC_JOYID_SERVER_URL ?? (network === "mainnet" ? "https://api.joy.id/api/v1" : "https://api.testnet.joyid.dev/api/v1");
const rpcURL = process.env.NEXT_PUBLIC_CKB_RPC_URL;

export async function connectCkbWallet(): Promise<ConnectedCkbWallet> {
  configureJoyID();

  const connection = await connect({
    name: "LiquidLane",
    network,
    joyidAppURL,
    joyidServerURL,
    rpcURL,
  });

  return walletFromConnection(connection);
}

export async function signCkbChallenge(challengeMessage: string, wallet: ConnectedCkbWallet): Promise<CkbWalletProof> {
  configureJoyID();

  const signed = await signChallenge(challengeMessage, wallet.ckbAddress, {
    name: "LiquidLane",
    network,
    joyidAppURL,
    joyidServerURL,
    rpcURL,
  });

  return {
    ...wallet,
    signature: encodeSignatureProof(signed),
  };
}

function configureJoyID() {
  initConfig({
    name: "LiquidLane",
    network,
    joyidAppURL,
    joyidServerURL,
    rpcURL,
  });
}

function walletFromConnection(connection: ConnectResponseData): ConnectedCkbWallet {
  const ckbAddress = pickAddress(connection);
  return {
    ckbAddress,
    walletType: "joyid_ckb",
    lockScript: toBackendScript(getJoyIDLockScript(network === "mainnet")),
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
