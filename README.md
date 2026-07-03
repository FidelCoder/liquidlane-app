# LiquidLane App

CKB wallet-authenticated web app for stablecoin liquidity vaults, Fiber capacity requests, and LP yield tracking on LiquidLane.

LiquidLane helps LPs deposit stablecoin liquidity and lets merchants, wallets, and apps request Fiber payment-channel capacity on demand.

## Development

```bash
cp .env.example .env.local
npm install
npm run dev
```

The app runs at `http://localhost:3000` by default.

## Product Entry

The first screen is a landing page with wallet connect in the top bar. After a CKB wallet is connected, users choose a LiquidLane service: supply liquidity, request receive capacity, or operate lanes. Choosing a service opens a Core wallet session without asking the wallet to sign again.

## CKB Wallet Flow

The app uses JoyID on CKB:

1. Connect JoyID and read the CKB address.
2. Choose a service and open a Core wallet session.
3. Sign only when confirming a value-moving action.
4. Supplying liquidity first creates a Core vault intent with the active vault address and memo.
5. The wallet signs and broadcasts that CKB transaction, then Core settles the intent into an LP position after receiving the transaction hash and signed transaction proof.

## Fiber Lifecycle

Capacity starts as `requested`. Opening a channel sends the request to LiquidLane Core, which either submits `open_channel` to a configured Fiber node or keeps the request in `pending_fiber_channel`. The UI does not invent channel ids.

Set `NEXT_PUBLIC_API_BASE_URL` if LiquidLane Core is not running on `http://localhost:8080`.
Set `NEXT_PUBLIC_CKB_RPC_URL` to a CKB RPC endpoint that accepts `get_cells` and `send_transaction`.
Set `NEXT_PUBLIC_CKB_EXPLORER_URL` to the CKB testnet explorer base URL used for deployment links.
The vault address is loaded from LiquidLane Core through `/vault`; configure it on the backend.

## Testnet Script Deployment

Operators can deploy LiquidLane CKB script binaries from the app with JoyID. Core serves the compiled script package from `/deployment/package`; the app collects funded JoyID cells through CKB RPC, asks JoyID to sign a raw transaction, broadcasts it, and shows the deployment transaction plus code-cell out-points.

This keeps deployer keys inside JoyID. The app does not ask for private keys or mnemonics.

## Checks

```bash
npm run lint
npm run build
```
