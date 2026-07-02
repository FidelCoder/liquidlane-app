# LiquidLane App

Wallet-authenticated web app for stablecoin liquidity vaults, channel capacity requests, and LP yield tracking on LiquidLane.

LiquidLane helps LPs deposit stablecoin liquidity and lets merchants, wallets, and apps request Fiber payment-channel capacity on demand.

## Development

```bash
cp .env.example .env.local
npm install
npm run dev
```

The app runs at `http://localhost:3000` by default.

## Wallet Auth

The app uses an injected wallet provider for the MVP:

1. Request wallet account.
2. Request a LiquidLane challenge from Core.
3. Ask the wallet to sign the challenge.
4. Verify the signature on the backend.
5. Store the returned bearer session locally.

## API Connection

Set `NEXT_PUBLIC_API_BASE_URL` if LiquidLane Core is not running on `http://localhost:8080`.

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:8080 npm run dev
```

The app requires LiquidLane Core to be running. It does not load fake fallback dashboard data.

## Checks

```bash
npm run lint
npm run build
```
