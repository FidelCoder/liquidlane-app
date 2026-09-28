import { ckb } from "./api";
import { useNow } from "./clock";
import type { WorkspaceRole } from "./navigation";
import type { Dashboard } from "./types";

export function Overview({ dashboard, role }: { dashboard: Dashboard; role?: WorkspaceRole }) {
  const now = useNow();
  const buying = dashboard.orders.filter(order => order.owner === dashboard.address);
  const supplying = dashboard.orders.filter(order => order.quote.fee_recipient === dashboard.address);
  const paid = (orders: typeof buying) => `${ckb(orders.filter(order => order.fee_status === "paid").reduce((sum, order) => sum + order.quote.opening_fee_ckb, 0))} CKB`;
  const metrics = role === "merchant" ? [
    ["My receiving nodes", dashboard.nodes.filter(node => node.role === "merchant").length], ["My capacity requests", buying.length], ["Opening fees paid", paid(buying)],
  ] : role === "provider" ? [
    ["Node wallet capital · last reported", `${ckb(dashboard.nodes.filter(node => node.role === "provider").reduce((sum, node) => sum + node.available_ckb, 0))} CKB`], ["Published offers", dashboard.offers.filter(offer => offer.enabled && offer.expires_at * 1000 > now).length], ["Opening fees received", paid(supplying)],
  ] : [["As merchant · requests", buying.length], ["As provider · requests", supplying.length], ["Opening fees received", paid(supplying)]];
  return <section className="workspace-metrics" aria-label="Your workspace totals">{metrics.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</section>;
}
