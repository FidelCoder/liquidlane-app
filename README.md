# LiquidLane App

Web app for managing stablecoin liquidity vaults, channel capacity requests, and LP yield on LiquidLane.

LiquidLane helps LPs deposit stablecoin liquidity and lets merchants, wallets, and apps request Fiber payment-channel capacity on demand.

## Product Flow

1. LP records a stablecoin deposit.
2. Merchant requests receive capacity.
3. LiquidLane shows a lease quote.
4. Capacity request is deployed into a Fiber channel.
5. Vault activity shows fee and deployment events.

## Development

```bash
cp .env.example .env.local
npm install
npm run dev
```

The app runs at `http://localhost:3000` by default.

## API Connection

Set `NEXT_PUBLIC_API_BASE_URL` if LiquidLane Core is not running on `http://localhost:8080`.

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:8080 npm run dev
```

If the API is offline, the app falls back to demo data so the product flow remains inspectable.

## Backend Pairing

Run LiquidLane Core separately:

```bash
cd ../liquidlane-core
cargo run
```

Then run the frontend:

```bash
cd ../liquidlane-app
npm run dev
```

## Checks

```bash
npm run lint
npm run build
```
