import type { Order } from "./types";

type FeeOrder = Pick<Order, "owner"> & {
  quote: Pick<Order["quote"], "fee_recipient" | "opening_fee_ckb">;
};

export function feeTransferRequest(order: FeeOrder) {
  const fee = order.quote.opening_fee_ckb;
  if (!Number.isSafeInteger(fee) || fee <= 0) throw new Error("Invalid quoted opening fee.");
  return {
    from: order.owner,
    to: order.quote.fee_recipient,
    // JoyID's transfer request uses decimal shannons, not display CKB.
    amount: (BigInt(fee) * BigInt(100_000_000)).toString(),
  };
}
