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

LiquidLane defaults to the current verified JoyID Pudge code cell `0x4a596d31dc35e88fb1591debbf680b04a44b4a434e3a94453c21ea8950ffb4d9#0x0` with dep type `code`, and validates it with `get_live_cell` before signing. Override `NEXT_PUBLIC_JOYID_CELL_DEP_TX_HASH`, `NEXT_PUBLIC_JOYID_CELL_DEP_INDEX`, and `NEXT_PUBLIC_JOYID_CELL_DEP_TYPE` only if JoyID rotates the testnet deployment again.

## Checks

```bash
npm run lint
npm run build
```
