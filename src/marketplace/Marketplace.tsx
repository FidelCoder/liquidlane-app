"use client";

import { useCallback, useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import { ConsoleApp } from "@/app/console";
import { Landing } from "@/app/landing";
import { connectCkbWallet, openJoyIdPopup, type ConnectedCkbWallet } from "@/lib/ckbWallet";
import { api, ApiError } from "./api";
import { signProof } from "./wallet";
import type { Dashboard, Listing, Run } from "./types";
import { Offers } from "./Offers";
import { Nodes } from "./Nodes";
import { Orders } from "./Orders";
import { useSession, storeSession } from "./session";
import { useConsoleNavigation, type ConsoleLocation, type WorkspaceRole } from "./navigation";
import { WalletControls } from "./WalletControls";
import { Overview } from "./Overview";

export function Marketplace() {
  const [connectedWallet, setWallet] = useState<ConnectedCkbWallet | null>(null);
  const session = useSession();
  const wallet = connectedWallet ?? session?.wallet ?? null;
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [location, navigate] = useConsoleNavigation();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    const results = await Promise.allSettled([
      api<{ offers: Listing[] }>("/market/offers"),
      session ? api<Dashboard>("/market/dashboard", session.token) : Promise.resolve(null),
    ]);
    const [offers, account] = results;
    if (offers.status === "fulfilled") { setListings(offers.value.offers); setLoaded(true); setUpdatedAt(Date.now()); }
    if (account.status === "fulfilled") setDashboard(account.value);
    for (const result of results) {
      if (result.status === "rejected" && result.reason instanceof ApiError && result.reason.status === 401) {
        storeSession(null);
      }
    }
    const failed = results.find(result => result.status === "rejected");
    setConnectionError(failed?.status === "rejected" ? String(failed.reason instanceof Error ? failed.reason.message : failed.reason) : null);
  }, [session]);
  useEffect(() => {
    const initial = setTimeout(() => void refresh(), 0);
    const timer = setInterval(() => void refresh(), 8000);
    return () => { clearTimeout(initial); clearInterval(timer); };
  }, [refresh]);

  const run: Run = useCallback(async (label, work) => {
    if (busy) return;
    setBusy(label); setError(null); setMessage(null);
    try { await work(); await refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(null); }
  }, [busy, refresh]);
  function connect() {
    const popup = openJoyIdPopup();
    void run("Connecting wallet", async () => {
      try { setWallet(await connectCkbWallet(popup)); setMessage("Wallet connected. Sign in to pair a node or request capacity."); }
      finally { popup?.close(); }
    });
  }
  function login() {
    if (!wallet) return;
    const popup = openJoyIdPopup();
    void run("Verifying wallet signature", async () => {
      try {
        const challenge = await api<{ challenge_id: string; message: string }>("/auth/challenge", undefined, { address: wallet.ckbAddress });
        const proof = await signProof(wallet, challenge.message, popup);
        const result = await api<{ token: string; expires_at: number }>("/auth/verify", undefined, { challenge_id: challenge.challenge_id, proof });
        storeSession({ ...result, wallet });
        setMessage("Signed in. Your nodes and orders are loading.");
      } finally { popup?.close(); }
    });
  }
  function logout() {
    void run("Signing out", async () => {
      if (session) await api("/auth/logout", session.token, {});
      storeSession(null); setWallet(null); setDashboard(null);
    });
  }
  const offline = !!connectionError || !updatedAt;
  const token = session?.token;
  const role: WorkspaceRole | undefined = location.startsWith("merchant") ? "merchant" : location.startsWith("lp") ? "provider" : undefined;
  const nodeView = location === "merchant/nodes" || location === "lp";
  const orderView = location.endsWith("/orders") || location === "portfolio";
  function go(next: ConsoleLocation) { navigate(next); setMessage(null); setError(null); }
  const auth = wallet ? login : connect;
  const walletControls = <WalletControls address={wallet?.ckbAddress} signedIn={!!token} busy={!!busy} run={run} onAuth={auth} onDisconnect={logout} />;
  const notices = <>
    {busy && <p className="notice" role="status">{busy}…</p>}
    {message && <p className="notice" role="status">{message}</p>}
    {error && <p className="notice error" role="alert">{error}</p>}
    {connectionError && <p className="notice error" role="alert">Marketplace unavailable: {connectionError}. Last received data may be stale.</p>}
  </>;
  if (location === "home") return <Landing walletControls={walletControls} notices={notices} onEnter={role => go(role === "merchant" ? "merchant" : "lp")} onPortfolio={() => go("portfolio")} />;
  const accountRequired = <section className="console-panel account-gate">
    <KeyRound size={26} /><h2>{token ? "Loading your workspace…" : wallet ? "Sign in with your wallet" : "Connect your wallet to continue"}</h2>
    <p>{role === "provider" ? "Sign in to pair your provider node, publish offers, and manage merchant requests." : role === "merchant" ? "Sign in to pair your receiving node and manage your capacity requests." : "Sign in to see your requests and fees across both roles."}</p>
    {!token && <button className="gold-button" disabled={!!busy} onClick={auth}>{wallet ? "Sign in" : "Connect wallet"}</button>}
  </section>;
  return <ConsoleApp location={location} onNavigate={go} walletControls={walletControls} notices={notices} onRefresh={() => void refresh()} refreshing={!!busy} connected={!offline}>
    {dashboard && token && <Overview dashboard={dashboard} role={role} />}
    <div hidden={location !== "merchant"}><Offers listings={listings} loaded={loaded} dashboard={dashboard} token={token} busy={!!busy || offline} run={run} onSignIn={auth} signInLabel={wallet ? "Sign in" : "Connect wallet"} onOrders={() => go("merchant/orders")} onPairNode={() => go("merchant/nodes")} onCreated={() => { go("merchant/orders"); setMessage("Request recorded. Your next step appears below."); }} /></div>
    {role && <div hidden={!nodeView}>{token && wallet && dashboard ? <Nodes key={`${wallet.ckbAddress}:${role}`} role={role} dashboard={dashboard} token={token} wallet={wallet} busy={!!busy || offline} run={run} onPaired={refresh} onBrowse={() => go("merchant")} onRequests={() => go("lp/orders")} /> : nodeView && accountRequired}</div>}
    {orderView && (token && wallet && dashboard ? <Orders orders={dashboard.orders} nodes={dashboard.nodes} listings={listings} role={role} token={token} wallet={wallet} busy={!!busy || offline} run={run} onBrowse={targetRole => go(targetRole === "provider" ? "lp" : "merchant")} /> : accountRequired)}
  </ConsoleApp>;
}
