# LiquidLane App

Web app for managing stablecoin liquidity vaults, channel capacity requests, and LP yield on LiquidLane.

## Development

```bash
npm install
npm run dev
```

The app runs at `http://localhost:3000` by default.

### API connection

Set `NEXT_PUBLIC_API_BASE_URL` if LiquidLane Core is not running on `http://localhost:8080`.

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:8080 npm run dev
```

If the API is offline, the app falls back to demo data so the product flow remains inspectable.
