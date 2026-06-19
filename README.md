# ReturnXchange — Salla Returns & Exchanges (v2)

Embedded, Salla-native returns/exchanges app on Zoho Catalyst. Merchants manage returns **inside the
Salla dashboard** (Embedded Page); customers start them from the **storefront** (App Snippet) or an
email-OTP portal. Refund / exchange / store-credit **auto-execute via Salla where supported**, with an
assisted-manual fallback everywhere else.

> Deeper docs: [`PROJECT_CONTEXT.md`](./PROJECT_CONTEXT.md) (spec + architecture) · [`DATASTORE_SCHEMA.md`](./DATASTORE_SCHEMA.md) (data model)

## Architecture (at a glance)
```
  Salla dashboard (Embedded Page)   Storefront snippet / email-OTP portal
                    │ SDK token                       │ session / OTP
                    ▼                                 ▼
   Salla API v2 ◀────  AppSail backend (Node 18 · Express · TS)  ────▶  Catalyst
   orders/txns         routes → services → repositories                 DataStore · Cache · FileStore
   coupons/shipments   Zod · status machine · audit log
        └────────────▶ /webhooks/salla  (HMAC, idempotent, 200-fast + async)
```
- Store id comes **only** from the introspected Salla token (never the client); store-bound HS256 session JWT.
- Per-tenant isolation on every row; OAuth tokens + PII AES-256-GCM encrypted; phone/email peppered-hashed.
- Status machine: `Requested → Approved → In Transit → Received → Resolved` (+ `Rejected`/`Cancelled`).
- Outbound Salla calls are capability-gated (see matrix) and cached; tokens refresh only near expiry.

## Layout
```
appsail/       Node 18 + Express + TS backend (Catalyst AppSail)
web-client/    React 18 + TS frontend (Catalyst Web Client, served at /app)
catalyst.json  links the two components
app-config.example.json  → copy to app-config.json (gitignored) and fill
```

## Quick start
```bash
# 1. Config (secrets are gitignored — copy the templates and fill them in)
cp app-config.example.json app-config.json
cp appsail/.env.example appsail/.env          # see the file header for key-gen commands

# 2. Run
cd appsail && npm install && npm run dev       # backend → http://localhost:9000
cd web-client && npm install && npm start      # frontend → http://localhost:3000/app

# 3. Build & test
npm run build                                  # appsail (tsc) + web-client (CRA)
cd appsail && npm test                          # jest

# 4. Deploy
catalyst deploy                                # both; or --only appsail:appsail for backend
```
Secrets (`SALLA_CLIENT_SECRET`, `SALLA_WEBHOOK_SECRET`, `SECURITY_PEPPER`, `ENCRYPTION_KEY_B64`,
`SESSION_SECRET`, `CRON_SECRET`) go in **Catalyst Console → Environment Variables**, never in the repo.

## Auto-execute capability matrix
Each capability is **off** until its Salla scope is granted *and* the endpoint is verified; off → assisted-manual fallback (no wasted/401 calls).

| Flag | Capability | Required scope |
|---|---|---|
| `SALLA_REFUND_AUTO` | Refund (transaction-based) | `transactions.read_write` |
| `SALLA_STORE_CREDIT_AUTO` | Store credit (coupons) | `marketing.read_write` |
| `SALLA_RETURN_AWB_AUTO` | Return shipment / AWB | `shippings.read_write` |

Enable: add scope in Salla Partners → merchant re-authorizes (fresh consent) → verify endpoint → set flag `true`.
(Bank transfer / COD orders are routed to manual refund even with scope.)

## Before go-live
- Grant the three scopes, re-authorize, verify endpoints, flip the flags.
- DataStore: add `return_items.exchange_variant_id` + `return_requests.bank_iban_enc` (see `DATASTORE_SCHEMA.md`).
- Register in Salla Partners: Embedded Page, App Snippet, webhook URL (`/webhooks/salla`).
- Schedule cron (POST + `X-Cron-Secret`): `/cron/{cleanup-sessions,purge-attachments,refresh-tokens}`.
- Remove debug surfaces: unset `DEV_DIRECT_LOGIN`; drop the `/auth/{connections,orders,store,statuses,probe}` endpoints.

## API surface
`/auth/{embedded,me,install,callback}` · `/merchant/{overview,analytics,returns,returns/:rma,rules}` +
`{approve,reject,receive,resolve}` · `/portal/{start,verify-otp,order-items,returns,...}` ·
`/webhooks/salla` · `/snippet/returns.js` · `/cron/*` · `/health`
