export type Node = {
  id: string; owner: string; role: "provider" | "merchant"; label: string;
  pubkey: string; address: string; version: string; last_seen: number;
  available_ckb: number; reserve_ckb: number; background?: boolean;
  provider_policy?: ProviderPolicy | null;
  funding?: { address: string; payload: string; signature: string } | null;
};
export type ProviderPolicy = { accept_public_orders: boolean; auto_approve: boolean; max_order_ckb: number; max_total_ckb: number; min_fee_ckb: number; committed_ckb: number };
export type Offer = {
  id: string; provider_node: string; owner: string; min_capacity_ckb: number;
  max_capacity_ckb: number; opening_fee_ckb: number; public_channel: boolean; enabled: boolean; expires_at: number;
};
export type Listing = {
  offer: Offer; provider: Pick<Node, "id" | "label" | "pubkey" | "last_seen" | "provider_policy">;
  automatic: boolean;
  online: boolean; available_capacity_ckb: number;
};
export type Quote = {
  protocol: string; network: string; order_id: string; provider_node: string;
  provider_pubkey: string; merchant_node: string; merchant_pubkey: string;
  merchant_address: string; merchant_account: string; capacity_ckb: number;
  funding_ckb: number; provider_reserve_ckb: number; merchant_reserve_ckb: number;
  opening_fee_ckb: number; fee_recipient: string; public_channel: boolean;
  expires_at: number; nonce: string;
};
export type Evidence = {
  channel_id: string; peer_pubkey: string; funding_outpoint: string; state: string;
  local_balance: string; remote_balance: string; inbound_liquidity: string;
  observed_at: number; settlement_tx_hash: string | null;
  state_flags?: string | null;
  settlement?: {
    closing_tx_hash: string; transaction_hashes: string[]; pending_outpoints: string[];
    confirmed: boolean; checked_at: number;
  } | null;
};
export type Order = {
  id: string; owner: string; offer_id: string; quote: Quote; quote_hash: string;
  provider_signature: string | null; status: string; channel_id: string | null;
  funding_outpoint: string | null; provider_evidence: Evidence | null;
  merchant_evidence: Evidence | null; probe_invoice: string | null;
  probe_payment_hash: string | null; probe_received: boolean; fee_status: string;
  fee_tx_hash: string | null; error: string | null; created_at: number; updated_at: number;
  delivered_at: number | null;
  automatic?: boolean;
};
export type Dashboard = { address: string; nodes: Node[]; orders: Order[]; offers: Offer[] };
export type Pairing = { setup_mode?: "new" | "existing" | "manual"; pairing_id: string; pairing_code: string; expires_at: number; account: string; role: "merchant" | "provider"; label: string };
export type PairingStatus = { status: "waiting" | "expired" | "paired"; expires_at: number; node: Node | null };
export type Run = (label: string, work: () => Promise<void>) => Promise<void>;
