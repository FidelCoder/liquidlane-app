export const apiBase = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:18080").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
export async function api<T>(path: string, token?: string, body?: unknown): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store", signal: AbortSignal.timeout(30_000),
  });
  const result = await response.json().catch(() => ({ error: "The marketplace returned an unreadable response." }));
  if (!response.ok) throw new ApiError(result.error ?? `Request failed (${response.status})`, response.status);
  return result as T;
}
export const short = (value: string) => `${value.slice(0, 9)}…${value.slice(-6)}`;
export const ckb = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 4 });
export const balance = (value: string) => Number(BigInt(value)) / 100_000_000;
export const fresh = (at: number) => Math.abs(Date.now() / 1000 - at) <= 90;
export const explorer = (hash: string) => `https://pudge.explorer.nervos.org/transaction/${hash}`;
export function receiverIssue(node: import("./types").Node): string | null {
  if (!node.last_seen) return "Paired. Waiting for the connector’s first check-in. Keep the connector running on your node machine.";
  if (!fresh(node.last_seen)) return "Your receiving node is offline. Restart its connector on your node machine; this page updates automatically.";
  if (node.reserve_ckb < 99) return "Your node has not reported its required channel reserve yet. Keep its connector running.";
  if (node.available_ckb < node.reserve_ckb + 63) return `Fund your Fiber node’s wallet with at least ${ckb(node.reserve_ckb + 63 - node.available_ckb)} more CKB. It needs ${ckb(node.reserve_ckb + 63)} CKB available for its reserve, change, and network fees. This is separate from your browser wallet.`;
  return null;
}
