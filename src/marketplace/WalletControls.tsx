import { useState } from "react";
import { CheckCircle2, Copy, KeyRound, LogOut, UserRound } from "lucide-react";
import { short } from "./api";
import type { Run } from "./types";

type Props = { address?: string; signedIn: boolean; busy: boolean; run: Run; onAuth: () => void; onDisconnect: () => void };
export function WalletControls({ address, signedIn, busy, run, onAuth, onDisconnect }: Props) {
  const [copied, setCopied] = useState(false);
  return <div className="console-actions wallet-actions">
    {address && <span className="console-wallet" data-state={signedIn ? "ready" : "restore"} title={address}>
      <UserRound size={15} /><span>{short(address)}</span>
      <button type="button" aria-label="Copy wallet address" onClick={() => void run("Copying wallet address", async () => { await navigator.clipboard.writeText(address); setCopied(true); })}>{copied ? <CheckCircle2 size={14} /> : <Copy size={14} />}</button>
    </span>}
    {!signedIn && <button className="gold-button" disabled={busy} onClick={onAuth}><KeyRound size={16} />{address ? "Sign in" : "Connect wallet"}</button>}
    {address && <button className="ghost-button" aria-label="Disconnect wallet" title="Disconnect wallet" disabled={busy} onClick={onDisconnect}><LogOut size={16} /><span>Disconnect</span></button>}
  </div>;
}
