import { expect, type Page } from "@playwright/test";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, writeFile, mkdir, open, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

type NodeConfig = { fiber_rpc: string; node_key_file: string; ckb_rpc: string };
type Login = { token: string; expires_at: number };
type PairFile = { pairing_code: string; expires_at: number };

export async function command(binary: string, args: string[], cwd: string, input?: string) {
  return new Promise<string>((resolve, reject) => {
    const child = execFile(binary, args, { cwd, timeout: 60_000, maxBuffer: 1_000_000 }, (error, stdout, stderr) => {
      if (error) reject(new Error(`${binary.split("/").at(-1)} failed: ${stderr || stdout}`));
      else resolve(stdout);
    });
    child.stdin?.end(input);
  });
}
async function freePort() {
  const server = createServer();
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test port available");
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return address.port;
}

// The coordinator/database are isolated. Fiber RPC, signatures, balances, and quotes are real.
// The automatic provider worker runs only before acceptance, so these UI checks never fund a channel.
// No JoyID passkey interaction is claimed by this test.
export class LivePilot {
  directory = "";
  coreURL = "";
  coreDirectory = resolve(process.env.LIQUIDLANE_CORE_DIRECTORY ?? "../liquidlane-core");
  receiver!: NodeConfig;
  provider!: NodeConfig;
  receiverAccount!: { address: string; session: Login; key: string; sessionFile: string };
  providerAccount!: { address: string; session: Login; key: string; sessionFile: string };
  providerConfig = "";
  private process?: ChildProcess;
  bin(name: string) { return join(this.coreDirectory, "target/debug", name); }
  async start(origin: string, providerWalletKey?: string) {
    this.directory = await mkdtemp(join(tmpdir(), "liquidlane-live-onboarding-"));
    this.receiver = JSON.parse(await readFile(process.env.LIQUIDLANE_LIVE_RECEIVER_CONFIG!, "utf8"));
    this.provider = JSON.parse(await readFile(process.env.LIQUIDLANE_LIVE_PROVIDER_CONFIG!, "utf8"));
    this.coreURL = `http://127.0.0.1:${await freePort()}`;
    const log = await open(join(this.directory, "core.log"), "w", 0o600);
    this.process = spawn(this.bin("liquidlane-core"), [], { cwd: this.directory, stdio: ["ignore", log.fd, log.fd], env: {
      ...process.env, LIQUIDLANE_PRODUCT_MODE: "marketplace", LIQUIDLANE_ENV: "test",
      LIQUIDLANE_BIND_ADDR: new URL(this.coreURL).host, LIQUIDLANE_MARKET_ORIGIN: origin,
      LIQUIDLANE_MARKET_DB: join(this.directory, "market.sqlite3"), LIQUIDLANE_CKB_RPC_URL: this.receiver.ckb_rpc,
    } });
    await log.close();
    await expect.poll(async () => {
      if (this.process?.exitCode !== null) throw new Error("Isolated coordinator stopped during startup");
      return fetch(`${this.coreURL}/health`).then(r => r.ok).catch(() => false);
    }, { timeout: 45_000 }).toBe(true);
    this.receiverAccount = await this.account("merchant");
    const providerAccount = this.providerAccount = await this.account("provider", providerWalletKey);
    const pair = await this.api<PairFile>("/market/nodes/pair", providerAccount.session.token, { role: "provider", label: "Live test provider" });
    const folder = join(this.directory, "provider");
    await mkdir(folder, { mode: 0o700 });
    const path = join(folder, "liquidlane-pairing.json");
    await writeFile(path, JSON.stringify({ format: "liquidlane-pairing/1", core_url: this.coreURL, ckb_rpc: this.provider.ckb_rpc, owner_address: providerAccount.address, ...pair, role: "provider", provider_policy: { max_order_ckb: 2000, max_total_ckb: 5000, min_fee_ckb: 61, allowed_merchants: [], accept_public_orders: true, auto_approve: true } }, (key, value) => ["pairing_id", "account", "label"].includes(key) ? undefined : value), { mode: 0o600 });
    await command(this.bin("liquidlane-connector"), ["setup", path, "--once"], folder, `${this.provider.fiber_rpc}\n${dirname(dirname(this.provider.node_key_file))}\n\n`);
    this.providerConfig = join(folder, "connector.json");
    const registration = JSON.parse(await readFile(join(folder, "connector-state/registration.json"), "utf8"));
    await this.api("/market/offers", providerAccount.session.token, { provider_node: registration.node.id, min_capacity_ckb: 500, max_capacity_ckb: 1000, opening_fee_ckb: 61, public_channel: true });
  }
  async account(name: string, existingKey?: string) {
    const key = existingKey ?? join(this.directory, `${name}.key`), sessionFile = join(this.directory, `${name}-session.json`);
    if (!existingKey) await writeFile(key, randomBytes(32), { mode: 0o600 });
    const address = (await command(this.bin("liquidlane-wallet"), ["address", key], this.directory)).trim();
    await command(this.bin("liquidlane-wallet"), ["login", key, this.coreURL, sessionFile], this.directory);
    return { address, key, sessionFile, session: JSON.parse(await readFile(sessionFile, "utf8")) as Login };
  }
  async api<T>(path: string, token: string, body?: unknown): Promise<T> {
    const response = await fetch(`${this.coreURL}${path}`, { method: body === undefined ? "GET" : "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? `API returned ${response.status}`);
    return data;
  }
  async attach(page: Page, role: "merchant" | "provider" = "merchant") {
    // Proxy to the isolated real API. Nothing is fulfilled with fabricated marketplace data.
    await page.route(/\/market\//, async route => {
      const url = new URL(route.request().url());
      const response = await route.fetch({ url: this.coreURL + url.pathname + url.search });
      await route.fulfill({ response });
    });
    await page.addInitScript(({ session, address }) => {
      // A real native-wallet login supplies the authenticated account; these tests never call JoyID.
      sessionStorage.setItem("liquidlane:marketplace:session", JSON.stringify({ ...session, wallet: { ckbAddress: address } }));
    }, { session: (role === "merchant" ? this.receiverAccount : this.providerAccount).session, address: (role === "merchant" ? this.receiverAccount : this.providerAccount).address });
  }
  async close() {
    if (this.process && this.process.exitCode === null) {
      const process = this.process;
      await new Promise<void>(resolve => { process.once("exit", () => resolve()); process.kill("SIGINT"); });
    }
    if (this.directory) await rm(this.directory, { recursive: true, force: true });
  }
}
