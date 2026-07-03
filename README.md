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

## CKB Wallet Auth

The app uses JoyID on CKB:

1. Connect JoyID and read the CKB address.
2. Request a LiquidLane challenge from Core.
3. Sign the challenge with JoyID.
4. Send the CKB proof and JoyID lock script to Core.
5. Store the returned bearer session locally.

## Fiber Lifecycle

Capacity starts as `requested`. Opening a channel sends the request to LiquidLane Core, which either submits `open_channel` to a configured Fiber node or keeps the request in `pending_fiber_channel`. The UI does not invent channel ids.

Set `NEXT_PUBLIC_API_BASE_URL` if LiquidLane Core is not running on `http://localhost:8080`.

## Checks

```bash
npm run lint
npm run build
```
