import { ckb, fresh } from "./api";
import type { Node, Order } from "./types";

export function reservedFunding(node: Node, orders: Order[]) {
  return orders.filter(order => order.quote.provider_node === node.id && ["awaiting_quote", "quoted", "accepted", "approved", "opening", "awaiting_confirmation", "verifying", "reconciling"].includes(order.status)).reduce((sum, order) => sum + order.quote.funding_ckb, 0);
}
export function availableProviderCapacity(node: Node, orders: Order[]) {
  const reserved = reservedFunding(node, orders), policy = node.provider_policy;
  const wallet = Math.max(0, node.available_ckb - 63 - reserved);
  const funding = policy ? Math.min(wallet, policy.max_order_ckb, Math.max(0, policy.max_total_ckb - policy.committed_ckb - reserved)) : wallet;
  return Math.max(0, funding - node.reserve_ckb - 1);
}
export function providerIssue(node: Node, capacity: number, orders: Order[]) {
  if (!fresh(node.last_seen)) return "Start your connector to connect this funding node.";
  if (!node.provider_policy?.accept_public_orders || !node.provider_policy.auto_approve) return "Update this node’s setup to serve merchants automatically.";
  if (!node.funding) return "Update and restart your connector to report the node’s funding address.";
  if (node.reserve_ckb < 99) return "Waiting for the node’s channel reserve report.";
  const funding = capacity + node.reserve_ckb + 1, policy = node.provider_policy;
  if (funding > policy.max_order_ckb) return `Your per-order limit supports at most ${ckb(Math.max(0, policy.max_order_ckb - node.reserve_ckb - 1))} CKB of receive capacity.`;
  if (funding + reservedFunding(node, orders) > policy.max_total_ckb - policy.committed_ckb) return "Your channel funding budget is in use. Increase the local limit or wait for capital to return from closed channels.";
  const missing = funding + 63 + reservedFunding(node, orders) - node.available_ckb;
  if (missing > 0) return `Add at least ${ckb(missing)} CKB to your node to offer ${ckb(capacity)} CKB of receive capacity.`;
  return null;
}
