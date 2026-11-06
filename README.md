# Sightline: market data sold per call over x402, paid through Pact

Sightline is a small Next.js app (frontend and backend) that sells crypto market intelligence the
way Nansen does, but with no subscription: each API call is one **x402** payment in USDT on
Whitechain Sepolia. **Pact** is the facilitator. It verifies each payment, settles it onchain and
pays the gas. Sightline only uses Pact's public x402 endpoints and its `X402AgentAccount` contracts.

| Endpoint | Price | Data |
| --- | --- | --- |
| `GET /api/v1/prices?symbols=BTC,ETH` | $0.001 | Spot price, 24h change, volume (live from CoinGecko) |
| `GET /api/v1/news?token=SOL` | $0.005 | Scored market wire |
| `GET /api/v1/smart-money?token=ETH` | $0.02 | Net flows from labelled wallets, top wallets |
| `GET /api/v1/insight?token=SOL` | $0.05 | 0–100 score, signal, thesis, risks |

Only the prices are real. News, flows and reports are modelled data, so the demo has no data licence.

## How a buyer pays

A buyer opens a **desk**: an `X402AgentAccount` they own, holding USDT.

```
Owner (browser key or MetaMask) ── signs Session{key, perCall, daily, expiry, [Sightline]} + Bootstrap (Permit2 approval)
        │                                  Sightline relays: factory.createAccount → configureSessionWithSig → bootstrap
        ▼
Session key (browser or AI agent) ── GET /api/v1/insight ──▶ 402 (price, payTo)
        │ signs the Permit2 payment's account-bound digest; Sightline relays vault.reserve()
        │ (the vault enforces per-call cap, daily cap, expiry and the merchant allowlist)
        └── retries with PAYMENT-SIGNATURE ──▶ Sightline ──/verify, /settle──▶ Pact ──▶ USDT moves vault → Sightline
                                                  ◀── 200 + data + PAYMENT-RESPONSE (tx hash)
```

Nobody but Sightline's relayer needs WBT. The session key cannot spend more than its owner signed,
cannot pay anyone else, and the owner can revoke it at any time (`/desk` → Revoke session key).

## The integration

`lib/server/paywall.ts` puts the official `@x402/hono` middleware in front of the routes, with
Pact as the facilitator:

```ts
const http = new HTTPFacilitatorClient({
  url: process.env.PACT_API_URL,
  createAuthHeaders: async () => ({ verify: auth, settle: auth, supported: {} }), // Bearer PACT_SECRET_KEY
});
const server = new x402ResourceServer(http).register('eip155:1874', new ExactEvmScheme());
paymentMiddleware({ 'GET /api/v1/insight': { accepts: { scheme: 'exact', network: 'eip155:1874', payTo, price: { asset: USDT, amount: '50000', extra: { assetTransferMethod: 'permit2' } } } } }, server);
```

The buyer side is the official `@x402/fetch` client with a signer whose address is the vault
(`lib/client/vault.ts` in the browser, `agent/src/sightline.ts` for agents).

## Run it

1. In Pact, create a merchant with a secret key. Locally, from `pact-pay/apps/api`:
   `pnpm exec tsx scripts/testnet/setup-merchant.ts --api http://127.0.0.1:3001 --origin http://localhost:3000 --name Sightline --email you@example.com --out ../../.runtime/testnet-local/x402-merchant.env`
2. `cp .env.example .env.local`, then fill in the secret key, the merchant address and a relayer key
   holding a little WBT (about 0.01 WBT per desk) and some test USDT for the faucet.
3. `pnpm install && pnpm build && pnpm start` → http://localhost:3240

Pages: `/` landing, `/desk` (open a desk, top up, limits, revoke, the agent's `.env`), `/terminal`
(buy each dataset), `/developers` (API and agent docs), `/merchant` (x402 revenue, every call linked to its transaction).

## The AI agent (`agent/`)

```sh
cd agent && pnpm install
pnpm setup                                     # opens a desk headless, writes .env, 2 test USDT
pnpm watch --tokens ETH,SOL --every 60         # rule-based watcher, pays per call, no LLM
ANTHROPIC_API_KEY=… pnpm ask "Is smart money accumulating SOL?"   # Claude buys the data it needs
```

`pnpm ask` runs Claude (`claude-opus-5-5`) with the four endpoints as tools. Each tool call is one
payment from the desk, and the run ends with the number of paid calls and their total cost.

## Notes

- Testnet only: test USDT and WBT. Pact settles at most 1 USDT per payment and takes no fee on x402.
- Desks and calls are kept in `data/sightline.json` for the demo; the session key lives in the
  browser's localStorage (or the agent's `.env`).
- A reservation cannot cross midnight UTC (a vault rule); a call made in the last two minutes of
  the day is refused with `InvalidWindow`. Retry it after midnight.
