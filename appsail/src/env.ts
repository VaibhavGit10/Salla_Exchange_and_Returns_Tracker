// appsail/src/env.ts
// Startup env validation. Fails fast (with a clear message) if a required secret is missing,
// so the service never boots in a half-configured / insecure state.
import { z } from "zod";

const numEnv = (def: number) =>
  z.preprocess((v) => {
    if (v === undefined || v === null || String(v).trim() === "") return def;
    const n = Number(v);
    return Number.isFinite(n) ? n : def;
  }, z.number());

const strDef = (def: string) =>
  z.preprocess((v) => {
    const s = typeof v === "string" ? v.trim() : "";
    return s === "" ? def : s;
  }, z.string());

const boolEnv = (def: boolean) =>
  z.preprocess((v) => {
    if (v === undefined || v === null || String(v).trim() === "") return def;
    return ["1", "true", "yes", "on"].includes(String(v).trim().toLowerCase());
  }, z.boolean());

const schema = z
  .object({
    NODE_ENV: strDef("production"),
    TZ: strDef("Asia/Riyadh"),
    CATALYST_ENV: z.string().optional(),

    APP_BASE_URL: z.string().url().optional(),
    DASHBOARD_URL: z.string().url().optional(),
    ALLOWED_ORIGINS: z.string().optional(),

    // ---- Salla OAuth / API ----
    SALLA_OAUTH_MODE: z.enum(["easy", "custom"]).default("easy"),
    SALLA_APP_ID: z.string().min(1, "SALLA_APP_ID is required (used for embedded introspection S-Source + install URL)"),
    SALLA_CLIENT_ID: z.string().min(1, "SALLA_CLIENT_ID is required"),
    SALLA_CLIENT_SECRET: z.string().min(1, "SALLA_CLIENT_SECRET is required (token exchange/refresh)"),
    SALLA_OAUTH_TOKEN_URL: strDef("https://accounts.salla.sa/oauth2/token").pipe(z.string().url()),
    SALLA_OAUTH_AUTHORIZE_URL: strDef("https://accounts.salla.sa/oauth2/auth").pipe(z.string().url()),
    SALLA_OAUTH_REDIRECT_URI: z.string().url().optional(),
    SALLA_OAUTH_SCOPE: z.string().optional(),
    SALLA_API_BASE_URL: strDef("https://api.salla.dev").pipe(z.string().url()),

    // ---- Phase-0 capability matrix (auto-execute gates) ----
    // Each Salla resolution capability stays OFF until its scope is granted in the Partners portal
    // AND the endpoint/payload is verified live. When OFF the service skips the Salla call entirely
    // and uses the assisted-manual fallback (no wasted, doomed API calls). Verified-blocked as of
    // 2026-06-19: refund→transactions.read_write, store_credit→marketing.read_write,
    // return AWB→shippings.read_write are all 401 (scopes not yet granted to app 1047822871).
    SALLA_REFUND_AUTO: boolEnv(false),
    SALLA_STORE_CREDIT_AUTO: boolEnv(false),
    SALLA_RETURN_AWB_AUTO: boolEnv(false),
    SALLA_INTROSPECT_URL: strDef("https://api.salla.dev/exchange-authority/v1/introspect").pipe(z.string().url()),
    SALLA_INSTALL_URL_BASE: strDef("https://s.salla.sa/apps/install"),
    SALLA_TOKEN_REFRESH_SKEW_SECONDS: numEnv(120),

    // ---- Webhook ----
    SALLA_WEBHOOK_SECRET: z.string().min(1, "SALLA_WEBHOOK_SECRET is required (webhook HMAC verification)"),

    // ---- Crypto / sessions ----
    SECURITY_PEPPER: z.string().min(1, "SECURITY_PEPPER is required"),
    ENCRYPTION_KEY_B64: z.string().min(1, "ENCRYPTION_KEY_B64 is required"),
    SESSION_SECRET: z.string().optional(),
    SESSION_TTL_SECONDS: numEnv(2 * 60 * 60),

    // ---- Customer portal / OTP ----
    PORTAL_SESSION_TTL_SECONDS: numEnv(4 * 60 * 60),
    PORTAL_SESSION_TOUCH_INTERVAL_SECONDS: numEnv(300),
    OTP_TTL_SECONDS: numEnv(600),
    OTP_MAX_ATTEMPTS: numEnv(3),
    OTP_LOCKOUT_SECONDS: numEnv(900),
    OTP_RATE_LIMIT_WINDOW_SECONDS: numEnv(300),
    OTP_RATE_LIMIT_MAX_IN_WINDOW: numEnv(5),
    OTP_FROM_EMAIL: z.string().optional(),

    // ---- Catalyst resources ----
    FILESTORE_FOLDER_ID: z.string().optional(),
    TENANT_CACHE_SEGMENT_ID: z.string().optional(),

    // ---- Cron ----
    CRON_SECRET: z.string().min(1, "CRON_SECRET is required (protects /cron/* endpoints)"),

    // ---- Retention ----
    DATA_RETENTION_DAYS: numEnv(365),
    ATTACHMENT_RETENTION_DAYS: numEnv(90),

    // ---- Dev-only local preview (NEVER set in production) ----
    DEV_DIRECT_LOGIN: z.string().optional(),
    DEV_DIRECT_STORE_ID: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.SALLA_OAUTH_MODE === "custom") {
      const hasOverride = !!(v.SALLA_OAUTH_REDIRECT_URI && v.SALLA_OAUTH_REDIRECT_URI.trim());
      if (!hasOverride && !(v.APP_BASE_URL ?? "").trim()) {
        ctx.addIssue({
          code: "custom",
          path: ["APP_BASE_URL"],
          message: "APP_BASE_URL or SALLA_OAUTH_REDIRECT_URI required in custom mode (derives /auth/callback)",
        });
      }
    }
  });

function loadEnv() {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`).join("\n");
    // eslint-disable-next-line no-console
    console.error(`\n[env] Invalid/missing configuration:\n${issues}\n`);
    throw new Error("Environment validation failed — see log above.");
  }
  return parsed.data;
}

export const env = loadEnv();
export type Env = typeof env;

export const isProd = env.NODE_ENV === "production";
/** Secret used to sign merchant/portal session JWTs. */
export const SESSION_SIGNING_SECRET = env.SESSION_SECRET || env.ENCRYPTION_KEY_B64;
