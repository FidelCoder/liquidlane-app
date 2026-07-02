# LiquidLane App

Authenticated web app for stablecoin liquidity vaults, channel capacity requests, and LP yield tracking on LiquidLane.

LiquidLane helps LPs deposit stablecoin liquidity and lets merchants, wallets, and apps request Fiber payment-channel capacity on demand.

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

The app requires LiquidLane Core to be running. It does not load fake fallback dashboard data.

## Product Flow

1. Sign in as an LP, merchant, or operator.
2. LP/operator deposits stablecoin liquidity.
3. Merchant/operator requests receive capacity.
4. LiquidLane quotes against live vault liquidity.
5. Capacity is reserved, deployed, and shown in the request lifecycle.

## Checks

```bash
npm run lint
npm run build
```
