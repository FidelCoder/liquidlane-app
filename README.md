# LiquidLane App

Merchant and provider interface for the LiquidLane CKB testnet marketplace. Providers fund native Fiber channels from their own nodes; merchants purchase initial receive capacity and pay the opening fee after verified delivery.

## Run

Requires Node 22.

```sh
cp .env.example .env.local
npm ci
npm run dev
```

Core defaults to `http://127.0.0.1:18080`; the app defaults to `http://localhost:3000`. Set `NEXT_PUBLIC_API_BASE_URL` to your actual Core URL before building. Configure the exact frontend origin in Core's `LIQUIDLANE_MARKET_ORIGIN`; use HTTPS for a hosted deployment.

## Journeys

- **Request Capacity · Merchant:** browse provider offers, pair your own receiving node under **My receiving nodes**, and follow your signed quote under **My requests**. Your wallet pays the opening fee after delivery; your Fiber node funds its native channel reserve.
- **Supply Liquidity · Provider:** connect your funding node, add CKB to its wallet, and publish its capacity and opening fee under **My offers & nodes**. The connector handles accepted requests automatically within your limits; follow delivery and fees under **Merchant requests**. Merchant nodes and setup fields do not appear in this workspace.
- **Portfolio:** view real activity and recorded fees across both roles, with filters for requests as a merchant or a provider. Each order names both parties and the current actor.

Node setup asks for a display name, creates a one-time pairing code, and downloads a pairing file. On Linux x86_64, provider setup defaults to `liquidlane-connector setup ./liquidlane-pairing.json --new-node --background`: it creates an unfunded Fiber node, verifies its identity/network, and starts Fiber and its connector as local user services. Install the connector before generating the ten-minute code. Existing-node setup uses `--background` without `--new-node`; manual setup remains available on other systems. Keys and the startup credential stay local. The background process does not need an open terminal; setup reports whether automatic startup works at boot or at login. The browser confirms pairing, online status, and funding readiness. A fresh paired background-service heartbeat advances provider setup to **Add capital**, showing the actual node-signed CKB funding address, available wallet balance, and minimum capital needed. The wallet signs a direct CKB transfer; signed bytes are saved before submission and retries reuse the same transaction. Only the node’s real on-chain balance makes capital available for offers. The same funding wallet is recognized without asking it to transfer to itself. Publishing requires a connected, funded node. Pending setup survives refresh and role switching; provider funding policy appears only in provider setup.

Requests track quote, acceptance, automatic channel opening, test payment, delivery verification, and direct fee payment. Listings identify automatic providers using their signed connector policy. New provider setup serves any merchant within the provider's per-order and total funding limits; no merchant addresses or per-order approval command are required. Channel state is separate from fee status.

JoyID connections require an additional signed login challenge. Login and order approval are verified by Core. Node private keys remain on the node machine. Wallet sessions are stored in the current browser tab and expire on the server.

Direct opening-fee transactions normalize JoyID's `dep_group` enum to the SDK's `depGroup` spelling before hashing, without changing the signed bytes. They are checked for the accepted recipient/amount, dry-run, then saved before broadcasting. The UI shows signing/submission progress and checks confirmation automatically while the request is open. Pending or committed saved payments reuse their existing hash; retries broadcast the same signed transaction only when it is unknown to the node. Keep that browser's storage until payment has been reconciled.

Providers fund their own Fiber node wallet and publish an offer. The connector verifies the merchant's acceptance and checks funds and limits before opening automatically. Legacy restricted/manual configurations remain visibly identified until their operator updates setup. The opening fee is not atomic with delivery and can remain unpaid; a provider can waive it. Initial capacity is consumed by payments. There is no guaranteed duration or passive yield.

## Checks and deployment

```sh
npm run lint
npm run build
npm start
```

Next.js is pinned to 16.3.6; the pinned TypeScript 5 compiler API performs full build typechecking. The Dockerfile builds a standalone server and requires the real `NEXT_PUBLIC_API_BASE_URL` build argument. Marketplace backend/connector documentation lives in `liquidlane-core/docs/marketplace-operations.md`.

`npm run build` includes the standalone server's static/public assets; `npm start` runs that production package. Set `HOSTNAME` and `PORT` for the desired listener. Browser checks use a running real coordinator and app: `npm run test:e2e`; set `PLAYWRIGHT_BASE_URL` when the app uses a different port.

The `wallet-contract` checks reproduce the dependency-enum mismatch against an already confirmed public pilot transaction and verify its original hash and signed bytes. They also inject RPC responses to check pending, committed, retry, and rejected-payment behavior without broadcasting that historical transaction. They do not automate a JoyID passkey signature.

The `onboarding-desktop` and `onboarding-mobile` projects additionally require two running, funded Fiber testnet nodes. Set `LIQUIDLANE_LIVE_RECEIVER_CONFIG` and `LIQUIDLANE_LIVE_PROVIDER_CONFIG` to their real connector configurations, and build the Core binaries first. The test starts its own isolated coordinator and authenticates accounts with real native-wallet signatures. It uses the live nodes for pairing, heartbeat balances, and quote signatures, checks automatic public-order settings and both participants' views of the request, then cancels before running another provider cycle. It does not open channels or automate a JoyID passkey or fee signature. These projects skip when live-node configuration is absent. The new local systemd installation and reboot flow needs a separate host check; see `liquidlane-core/docs/automatic-provider-setup.md`.

The original dark landing and console design is restored in `src/app/landing.tsx` and `src/app/console.tsx`. Global styles reuse the original `src/legacy/vault.css`; marketplace adaptations live in `src/marketplace/console.css`. The archived vault business logic is not mounted as a marketplace route. Preserve the archive and old recovery records when migrating an existing deployment.

MIT license. The JoyID/CKB SDK dependency tree retains a low-severity `elliptic` advisory; marketplace quote verification uses Noble and wallet signatures are produced by JoyID. See the Core operations guide for the recorded dependency review and remaining live-wallet validation.
