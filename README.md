# 🔁 ReturnXchange — Salla Returns & Exchanges

> A Salla-native app that lets online stores handle **returns, exchanges, and refunds** in one place —
> right inside the Salla dashboard for merchants, and from the storefront for shoppers.

> 🛍️ Customers request a return in a few taps · 🧑‍💼 merchants review and resolve it · 💸 refunds,
> exchanges, and store credit happen automatically wherever Salla allows, with a safe manual fallback.

---

## Table of Contents

1. [Project Overview](#-project-overview)
2. [How It Works](#-how-it-works)
3. [Repository Structure](#-repository-structure)
4. [Prerequisites](#-prerequisites)
5. [Setup & Configuration](#️-setup--configuration)
6. [Running & Deploying](#-running--deploying)
7. [Auto-Execute Capabilities](#-auto-execute-capabilities)
8. [Going Live](#-going-live)
9. [Troubleshooting](#-troubleshooting)
10. [Additional Tips](#-additional-tips)
11. [License](#-license)

---

## 📝 Project Overview

ReturnXchange turns the messy, manual returns process (usually handled over WhatsApp or email) into a
structured, self-serve flow:

- **Merchants** manage everything from a console **embedded inside the Salla dashboard** — no separate
  login. They set return rules, review requests, and resolve them.
- **Customers** start a return from the **storefront** (a button injected by an App Snippet) or from a
  **hosted portal** secured with a one-time email code (OTP).
- **Resolutions** — refund, exchange, or store credit — are **carried out against Salla automatically**
  where the platform supports it. Where it doesn't, the app guides the merchant through a manual step
  and records the outcome, so nothing ever breaks.

Built for KSA/GCC Salla merchants, Arabic-first (RTL) with English support.

---

## 🔄 How It Works

A return moves through a clear, tracked lifecycle:

```
Requested  →  Approved  →  In Transit  →  Received  →  Resolved
                 └─→ Rejected            (or Cancelled at any point)
```

1. **Request** — the customer picks items, a reason, and a preferred resolution (refund / exchange / credit).
2. **Review** — the merchant approves or rejects based on the store's return rules (window, eligibility, value).
3. **Return shipment** — a return label is generated if the carrier supports it, otherwise the customer
   gets manual return instructions.
4. **Resolve** — once items are received, the refund / exchange / credit is issued and the customer is notified.

Behind the scenes the app stays in sync with Salla through **webhooks** (e.g. an order refunded or
cancelled in Salla updates the return automatically).

---

## 📁 Repository Structure

```
├── appsail/                # Backend — Node + Express + TypeScript (runs on Catalyst AppSail)
│   ├── src/routes/         # API endpoints (auth, merchant, portal, webhooks, cron, health)
│   ├── src/services/       # Business logic (returns, rules, resolution, notifications…)
│   ├── src/repositories/   # Data access (Zoho DataStore)
│   └── .env.example        # Backend config template (copy → .env, fill in)
├── web-client/             # Frontend — React (merchant console + customer portal), served at /app
│   └── .env.example        # Frontend config template
├── app-config.example.json # Deploy config template (copy → app-config.json, fill in)
├── catalyst.json           # Links the backend + frontend for deployment
├── PROJECT_CONTEXT.md      # Full product spec & architecture
├── DATASTORE_SCHEMA.md     # Database schema
└── README.md               # ← You are here
```

---

## ✅ Prerequisites

- **Node.js 18** and npm
- **Zoho Catalyst** account + the [Catalyst CLI](https://catalyst.zoho.com/) (`catalyst` command)
- A **Salla Partner account** with an app registered (for the App ID, client credentials, and webhook secret)
- A Salla **demo/test store** connected to the app for testing

---

## ⚙️ Setup & Configuration

Secrets are **never committed** to this repo. Copy the provided templates and fill them in locally:

```bash
# 1. Clone
git clone https://github.com/VaibhavGit10/Salla_Exchange_and_Returns_Tracker.git
cd Salla_Exchange_and_Returns_Tracker

# 2. Copy the config templates (the real files are gitignored)
cp app-config.example.json app-config.json
cp appsail/.env.example     appsail/.env
cp web-client/.env.example  web-client/.env
```

Then fill in your values. The secret keys go in **Catalyst Console → Environment Variables** for
production (never in the repo). The `appsail/.env.example` header includes one-line commands to
generate fresh encryption/session keys.

| What | Where it comes from |
|---|---|
| `SALLA_APP_ID`, `SALLA_CLIENT_ID`, `SALLA_CLIENT_SECRET` | Salla Partners → your app |
| `SALLA_WEBHOOK_SECRET` | Salla Partners → webhook settings |
| `ENCRYPTION_KEY_B64`, `SECURITY_PEPPER`, `SESSION_SECRET`, `CRON_SECRET` | Generate locally (see `.env.example`) |

---

## 🚀 Running & Deploying

**Develop locally**
```bash
cd appsail && npm install && npm run dev        # backend → http://localhost:9000
cd web-client && npm install && npm start       # frontend → http://localhost:3000/app
```

**Build & test**
```bash
npm run build                                    # builds backend + frontend
cd appsail && npm test                            # backend tests
```

**Deploy to Catalyst**
```bash
catalyst deploy                                  # deploys both components
catalyst deploy --only appsail:appsail           # backend only (faster)
```

---

## 🔌 Auto-Execute Capabilities

Each automated resolution stays **switched off** until two things are true: the matching permission
(scope) is granted to the app in Salla, **and** the integration has been verified. While off, the app
simply falls back to a guided manual step — it never fires a call it isn't allowed to make.

| Setting | What it automates | Salla permission needed |
|---|---|---|
| `SALLA_REFUND_AUTO` | Refunds | `transactions.read_write` |
| `SALLA_STORE_CREDIT_AUTO` | Store credit / coupons | `marketing.read_write` |
| `SALLA_RETURN_AWB_AUTO` | Return shipping labels | `shippings.read_write` |

**To switch one on:** add the permission in Salla Partners → ask the merchant to re-approve the app →
confirm it works → set the flag to `true`.
> Note: bank-transfer and cash-on-delivery orders are always refunded manually, since Salla can't
> refund them automatically.

---

## 🏁 Going Live

- Grant the three permissions above, re-approve the app, verify, and switch on the flags.
- In Salla Partners, register: the **Embedded Page**, the **storefront App Snippet**, and the
  **webhook URL** (`/webhooks/salla`).
- Schedule the maintenance jobs (session cleanup, image purge, token refresh) in Catalyst Cron.
- Turn off the development helpers (`DEV_DIRECT_LOGIN` and the debug endpoints) before public launch.

---

## 🧯 Troubleshooting

- **"Salla not connected" / 401 errors** → the store needs to (re-)install/approve the app so a fresh
  access token is issued.
- **A resolution falls back to manual** → the related permission isn't granted yet, or its flag is off.
  Check the [Auto-Execute Capabilities](#-auto-execute-capabilities) table.
- **Webhooks not updating returns** → confirm the webhook URL and secret match what's set in Salla Partners.
- **Local backend won't start** → make sure you copied `appsail/.env` and filled the required secrets.

---

## 💡 Additional Tips

- Keep `app-config.json` and `.env` files **out of version control** — only the `*.example` templates belong in the repo.
- Use a **demo store** for testing before pointing the app at a live store.
- The store identity always comes from Salla's verified token, never from the browser — don't bypass this.
- Check `/health` after a deploy to confirm the backend and database are reachable.

---

## 📜 License

Proprietary — © Fristine Infotech. All rights reserved.
