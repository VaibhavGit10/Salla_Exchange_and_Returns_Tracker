# ReturnXchange — Project Context

> **Product name: ReturnXchange** (Salla Returns & Exchanges v2). Use this brand in all
> user-facing surfaces — embedded console, customer portal, emails, App Store listing.

> Single source of truth for this rebuild. Contains the **corrected BRD** (the spec),
> the **implementation plan** (the how), and a **reference code map** (what to port/adapt).
> Authoritative spec doc the BRD derives from: the technical BRD suite
> (`.claude/Salla_Technical_BRD_Complete.txt`, BRD 03).
>
> **Layout:** this folder IS the Catalyst-bound project root (`.catalystrc` → project
> `Salla-Exchange-and-Returns-Tracker`). v2 is built here; the previous app is archived under `v1/`.
> Reuse the same Catalyst resource IDs: `FILESTORE_FOLDER_ID=17682000000848740`,
> `TENANT_CACHE_SEGMENT_ID=17682000000848733`, AppSail base
> `https://appsail-50037613927.development.catalystappsail.in`. **Rotate every secret** that leaked in
> `v1/app-config.json` before any deploy.

**App:** Salla Returns & Exchanges (with lightweight Warranty flag)
**Salla App ID:** `1047822871` · **Platform:** Salla Merchant API v2 (`https://api.salla.dev/admin/v2`)
**Infra:** Zoho Catalyst — AppSail (Node 18 + Express + TypeScript backend) + Web Client (React 18 + TS)
**Demo store:** `Return_Exchange_Demo_Store` (connected in Salla Partners → App Testing)

---

## Why this rebuild exists

The previous app (now archived in `v1/`) is an advanced prototype with a clean skeleton but
three disqualifying problems for production:

1. **No real merchant auth** — `middlewares/authMerchantPlaceholder.ts` was a single shared
   `MERCHANT_DEBUG_KEY`; no Salla-identity-bound session.
2. **Records returns, doesn't execute them** — `resolve()` only stored hand-typed refund/exchange
   reference IDs; never called Salla to actually issue refunds/exchanges/credit.
3. **Predates Salla's current surfaces** — built as two standalone SPAs. Salla now offers
   **Embedded Pages**, **App Snippets**, **Onboarding Steps**, **App Subscriptions** (billing).

v2 fixes all three: embedded merchant console, storefront snippet entry, real auto-execution.

---

# PART A — Corrected BRD 3 (realistic & doable)

> Revision principle: promise only what is verifiable. Every operation that depends on Salla
> exposing an API (refund, exchange order, store credit, return shipping label) is written as
> **"auto-execute if the API supports it, else assisted-manual fallback"** and gated behind the
> Phase-0 capability check. No "magic" is assumed.

### 1. Purpose
Automate the returns/exchange/warranty-claim workflow for Salla merchants: a low-friction customer
return experience launched from inside the store, a merchant console embedded in the Salla
dashboard, and resolution actions that execute against Salla wherever the platform allows.

### 2. Objectives & success metrics (targets)
- ≥ 50% reduction in returns-related support tickets within 60 days of activation
- Auto-approved resolution < 48h; manual-review resolution < 5 days
- ≥ 80% of returns submitted self-serve (no support contact)
- ≥ 80% monthly renewal rate

### 3. Target users
KSA/GCC Salla merchants with meaningful return volume (fashion, electronics, beauty) who want
structured rules + tracking instead of WhatsApp/manual handling.

### 4. Design principles (Salla-native)
- **Embedded-first merchant UX** — Salla *Embedded Page* (iframe), authenticated via the Salla
  embedded SDK + Introspection API. No separate merchant login.
- **Storefront entry for customers** — a Salla *App Snippet* injects a "Request/Track a Return"
  button into the storefront; the logged-in customer needs **no OTP**. Hosted portal with
  **email-OTP** is the off-store fallback.
- **Event-driven** — react to Salla webhooks; never poll where an event exists.
- **Capability-gated** — verify Salla API support before promising auto-execution; always ship a
  manual fallback.

### 5. In scope (MVP)
- Customer return/exchange request: item selection, reason codes, image upload, preferred resolution
  (refund / exchange / store credit).
- Entry via storefront App-Snippet (primary, no OTP) **or** hosted portal with order# + **email-OTP**.
- Merchant rules: return window (global + per-category), category exclusions, auto-approve
  threshold, allowed resolutions, SLA target.
- Workflow pipeline: **Requested → Approved → In Transit → Received → Resolved**, plus **Rejected**
  and **Cancelled** terminals.
- Reverse logistics: create return shipment label via Salla shipping **if supported**, else manual
  return-instructions fallback; tracking shown to customer + merchant.
- Resolution execution: **refund / exchange-order / store-credit auto-executed via Salla API where
  supported**, else assisted-manual recording. **COD orders**: refund via collected IBAN or store
  credit (not original payment).
- Lightweight **warranty** flag on a request; full warranty lifecycle deferred.
- Email notifications on every state change; full audit trail.
- Arabic-first **RTL** + English UI.
- Salla-managed **subscription billing** with monthly-volume plan gating.

### 6. Out of scope (MVP)
Fraud detection, warehouse QC automation, multi-warehouse routing, SMS/WhatsApp channels, full
warranty (period/claim/repair-vs-replace) — all Phase 2+.

### 7. Functional requirements
- **7.1 Entry & auth** — Snippet: derive customer + order from storefront session (no OTP). Portal:
  order#+contact → 6-digit email OTP (10-min TTL, 3 attempts, lockout) → scoped session.
- **7.2 Return request** — items[{order_item_id, qty, reason_code}], reason_detail (required if
  "other"), up to 5 images ≤5MB (required for defective), resolution preference, exchange_variant_id
  (if exchange), bank_iban (if COD refund).
- **7.3 Merchant console (embedded)** — inbox (filter status/reason/SKU/date), detail
  (order data/items/images/timeline), approve/reject (reason), mark received, resolve (auto-execute),
  rules screen, analytics (reasons by SKU), plan/billing.
- **7.4 Rules engine** — window global + per-category, excluded categories, auto-approve below value
  threshold; eligibility checks: order delivered, within window, category allowed, no duplicate
  active return, qty ≤ ordered.
- **7.5 Reverse logistics** — on Approve, create Salla return shipment if carrier API supports it;
  else show merchant-defined return address/instructions. Relay tracking.
- **7.6 Resolution** — refund (Salla refund API ▸ COD via IBAN/credit), exchange (create replacement
  order), store credit (Salla coupon/credit ▸ else recorded voucher). Record outcome + timestamp.
- **7.7 Events** — handle `app.store.authorize` (tokens), `app.uninstalled`, `app.subscription.*`
  (billing), `order.refunded` (sync→Resolved), `order.cancelled` (auto-reject pending),
  `order.shipment.created` (window calc). HMAC-verified, idempotent, 200-fast + async.
- **7.8 Notifications** — email at launch via pluggable channel layer (SMS/WhatsApp later).
- **7.9 Billing** — Salla App Subscriptions; gate monthly return volume by plan.

### 8. Non-functional
Embedded/session/OTP security (no client-supplied store_id; store_id only from introspected token) ·
per-tenant encrypted attachment storage (FileStore), images purged 90d · mobile Lighthouse ≥ 80 ·
immutable audit trail (24m) · **PDPL**: data used only for resolution, retention limits, customer
deletion path · secrets in Catalyst secret store, never in repo.

### 9. Dependencies & Phase-0 verification (the realism anchor)
Verify on `Return_Exchange_Demo_Store`: (a) order **refund** API + payload; (b) **exchange order**
creation; (c) **store-credit/coupon** issuance; (d) **return shipment/AWB** API; (e) **App
Subscriptions** billing API + webhook names; (f) **App Snippet** access to storefront customer/order
identity; (g) embedded introspection for app `1047822871`. Output = a capability matrix marking each
feature **auto** vs **assisted-manual fallback**. The MVP ships fully either way — only the degree of
automation varies.

### 10. Monetisation (Salla App Subscriptions)
Essential (≤50 returns/mo, manual approval, basic portal) · Business (≤300, auto-rules + shipping) ·
Enterprise (unlimited, custom branding + analytics). Final SAR pricing TBD.

### 11. Phasing
MVP = §5. Phase 2 = SMS/WhatsApp, full warranty, fraud signals. Phase 3 = multi-warehouse, QC.

---

# PART B — Implementation Plan

## Stack & conventions
Node 18 + Express + TypeScript backend (AppSail); React 18 + TS frontend (Web Client). Zoho
DataStore: ZCQL reads (≤200 rows, no JOIN/OFFSET, **BIGINT/FK unquoted in WHERE**), DataStore SDK
for writes. Timestamps `YYYY-MM-DD HH:mm:ss`. Pino logger object-first: `logger.info({d}, "msg")`.
FileStore `uploadFile()` wants a ReadStream (`Readable.from(buffer)`). Catalyst Cache values are
strings. 3-layer: `routes → services → repositories`; Zod validators on all input.

## Repo structure (`Salla_Returns_v2/`)
```
appsail/src/
  lib/         catalyst, crypto, logger, errors, datetime, retryWithBackoff,
               statusMachine, sallaApi, session(JWT HS256), embeddedIntrospect, env
  middlewares/ requestId, rawBody, authEmbedded(merchant), authPortal(customer), error
  security/    signature(webhook HMAC), pii(hashing)
  repositories/ tenants, returnRequests, returnItems, returnAttachments,
               sallaOauthTokens, portalSessions, otpSessions, webhookEvents,
               auditEvents, usageMonthly, storeCredits, subscriptions
  services/    sallaOAuth, sallaOrders, sallaShipments, sallaResolution(refund/exchange/credit),
               returns, merchantReturns, rules, otp, portalAuth, billing, usage, webhooks,
               notifications/(index + channels/email)
  validators/  portal.zod, merchant.zod, returns.zod, rules.zod
  routes/      auth, merchant, portal, snippet, webhooks, billing, cron, health
web-client/src/
  auth/(embedded.ts, session.ts) · pages/merchant/* · pages/portal/* ·
  components/ · services/api · services/http · i18n/(ar,en)
catalyst.json · app-config.json (NO secrets) · appsail/.env.example
```

## Data model (DataStore; every table indexed by `tenant_id`; store id is the tenant key)
- `tenants` — salla_store_id, portal_public_slug, store_name, store_domain, status, flags_json(rules), plan
- `salla_oauth_tokens` — access/refresh enc, expiry, token_status, scopes
- `return_requests` — return_number(RMA), order_id_external, order_number, status, requested_resolution,
  resolution_outcome, refund_transaction_id_external, exchange_order_id_external, store_credit_ref_external,
  bank_iban_enc, totals, is_warranty, customer_contact_hash/masked, timestamps
- `return_items` — sku, product_name, qty, unit_price, reason_code, reason_note, decision, exchange_variant_id
- `return_attachments` — filestore_path, content_type, size
- `store_credits` — code, amount, currency, status (store-credit resolution)
- `subscriptions` — salla_plan_id, status, period_end, monthly_quota
- `portal_sessions`, `otp_sessions`, `webhook_events`(idempotency_key unique), `audit_events`, `usage_monthly`

## Backend API surface
| Group | Endpoint | Auth |
|---|---|---|
| Auth | `POST /auth/embedded`, `GET /auth/me`, `GET /auth/install`, `GET /auth/callback` | embedded/introspect ; none |
| Merchant | `GET /merchant/overview\|returns\|returns/:rma\|analytics`; `POST /merchant/returns/:rma/{approve,reject,receive,resolve}`; `GET/PUT /merchant/rules` | session |
| Snippet | `GET /snippet/returns.js` | app |
| Customer | `POST /portal/start`, `POST /portal/verify-otp`, `GET /portal/order-items`, `POST /portal/returns`, `POST /portal/returns/:rma/attachments`, `GET /portal/returns/:rma/track`, `POST /portal/returns/:rma/cancel` | portal session |
| Webhooks | `POST /webhooks/salla` | HMAC rawBody |
| Billing | `GET /billing/plan` (+ `app.subscription.*` webhook) | session/HMAC |
| Cron | `/cron/*` | `X-Cron-Secret` |
| Health | `GET /health` | none |

**Webhook pattern:** verify HMAC on rawBody → route lifecycle (`app.store.authorize` store tokens +
sync name + subscribe events; `app.uninstalled`; `app.subscription.*`) → idempotency dedupe
(`store_id+external_id+type`) → **return 200 immediately, dispatch order events async**.

## Core new piece — `sallaResolution.service.ts`
On **Resolve**, execute via Salla (not hand-typed refs):
- **refund** → Salla refund endpoint, store txn id. **COD** → use collected `bank_iban` or store credit.
- **exchange** → create replacement order for `exchange_variant_id`, store exchange_order_id.
- **store_credit** → issue coupon/credit, persist in `store_credits`.
- On **Approve** → `sallaShipments` creates return AWB label (auto) or manual instructions (fallback).
Each wrapped so an unsupported endpoint degrades to assisted-manual, never crashes.

## Notifications — pluggable channel layer
`services/notifications/` with a `Channel` interface; launch impl = `email` (Catalyst Email).
SMS/WhatsApp drop in later. OTP fires only on the off-store fallback path.

## Security must-haves
Secrets only in Catalyst env/secret store (the old `app-config.json` leaked client secret +
encryption/pepper/webhook/session keys — **rotate them**). Zod env validation at startup. AES-256-GCM
for tokens/PII; SHA-256 hash phone/email; PDPL: image purge 90d, customer delete, audit 24m. No
debug-key bypass in prod (explicit opt-in flags only).

## Build phases
- **P0** Salla capability matrix (live token on demo store).
- **P1** Scaffold + Salla spine (OAuth easy, embedded auth/session, webhook async+idempotent, tenant isolation). *Exit: install → embedded dashboard authenticated.*
- **P2** Returns core (repos, rules engine, customer flow snippet+OTP, submission+attachments, merchant inbox + approve/reject/receive).
- **P3** Auto-execute resolution + AWB + email notifications. *Exit: end-to-end real resolution.*
- **P4** Frontend (embedded merchant + customer), billing (App Subscriptions + gating), onboarding, real analytics, Arabic RTL, Lighthouse.
- **P5** Hardening: cron, rate limits, tests, builds green, listing assets.

## Verification / testing
P0 against demo store with real token (record payloads) · unit (rules, status machine, signature,
session) · integration (install→authorize→embedded login→create→approve→resolve→webhook reconcile) ·
webhook 200<3s + idempotency replay · `cd web-client && npm test` + manual embedded run via
App Testing · `/health` (DataStore + FileStore).

---

# Reference code map (port / adapt — do not reinvent)

**Port the modern Salla spine FROM the tracking app**
`../Salla Server side tracking app/Salla_Server_Side_Tracker/`:
- `web-client/src/auth/embedded.js` — `@salla.sa/embedded-sdk` init → `auth.getToken()` → POST
  `/auth/embedded`; standalone fallback when not framed. → port to `web-client/src/auth/embedded.ts`.
- `appsail/controllers/auth.controller.js` (`embeddedLogin`, `me`) + `appsail/security/session.js`
  (HS256 sign/verify, store_id-bound, 2h TTL) + `appsail/services/salla.service.js`
  (`introspectEmbeddedToken` → `https://api.salla.dev/exchange-authority/v1/introspect`, header
  `S-Source: <appId>`; `exchangeCodeForToken`; `fetchStoreProfile` `/store/info`→`/settings/store`,
  localized name `{ar,en}`). → `lib/session.ts`, `lib/embeddedIntrospect.ts`, `services/sallaOAuth.service.ts`.
- `appsail/middlewares/auth.middleware.js` (`requireAuth` derives store_id from session, **force-overwrites**
  req.query/body/params.store_id). → `middlewares/authEmbedded.ts`.
- `appsail/controllers/webhook.controller.js` — HMAC verify on rawBody → lifecycle routing →
  idempotency dedupe → **200-fast + async dispatch**. → `routes/webhooks.routes.ts` + `services/webhooks.service.ts`.

**Adapt the good skeleton FROM the previous app** `v1/appsail/src/`:
- `lib/` crypto (AES-256-GCM), errors (`AppError`), logger (Pino), datetime (`toCatalystDateTime`),
  retryWithBackoff, statusMachine, sallaApi — reuse largely as-is.
- `services/rules.service.ts` (eligibility + auto-approval) — reuse, extend.
- `services/returns.service.ts`, `merchantReturns.service.ts` — reuse logic; **replace the hollow
  `resolve()` with real `sallaResolution` calls**.
- repos (`returnRequests`, `returnItems`, `auditEvents`, etc.) — reuse the shapes.
- validators (`returns.zod`, `portal.zod`, `merchant.zod`) — reuse, extend (bank_iban, exchange_variant_id).
- **Do NOT copy** `middlewares/authMerchantPlaceholder.ts` (replaced by embedded auth) or any secrets
  from `app-config.json`.

---

## Open items to confirm during build
- Full warranty scope for Phase 2 (currently MVP flag only).
- Post-launch comms: SMS (Unifonic/Taqnyat) and/or shared WhatsApp BSP with the existing WhatsApp app.
- Final SAR pricing tiers.
- Live demo-store access token for Phase-0 endpoint verification.
