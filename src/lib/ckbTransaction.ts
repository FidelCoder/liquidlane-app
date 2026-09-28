import type { CKBTransaction } from "@joyid/ckb";

// JoyID can return the RPC enum spelling inside its camelCase transaction.
// Canonicalize the spelling before SDK hashing; the signed bytes do not change.
export function normalizeCkbTransaction(tx: CKBTransaction): CKBTransaction {
  return {
    ...tx,
    cellDeps: tx.cellDeps.map(dep => {
      const depType: string = dep.depType;
      if (depType !== "code" && depType !== "depGroup" && depType !== "dep_group") {
        throw new Error("Wallet returned an unsupported transaction dependency type.");
      }
      return { ...dep, depType: depType === "dep_group" ? "depGroup" : depType };
    }),
  };
}

export function toRpcTransaction(transaction: CKBTransaction) {
  const tx = normalizeCkbTransaction(transaction);
  return {
    version: tx.version,
    cell_deps: tx.cellDeps.map(dep => ({
      out_point: { tx_hash: dep.outPoint.txHash, index: dep.outPoint.index },
      dep_type: dep.depType === "depGroup" ? "dep_group" : dep.depType,
    })),
    header_deps: tx.headerDeps,
    inputs: tx.inputs.map(input => ({
      previous_output: { tx_hash: input.previousOutput.txHash, index: input.previousOutput.index },
      since: input.since,
    })),
    outputs: tx.outputs.map(output => ({
      capacity: output.capacity,
      lock: toRpcScript(output.lock),
      type: output.type ? toRpcScript(output.type) : null,
    })),
    outputs_data: tx.outputsData,
    witnesses: tx.witnesses,
  };
}

function toRpcScript(script: { codeHash: string; hashType: string; args: string }) {
  return { code_hash: script.codeHash, hash_type: script.hashType, args: script.args };
}
