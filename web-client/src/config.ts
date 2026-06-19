// Resolves the AppSail API base. Dev → CRA proxy (relative). Prod → configured/known AppSail URL.
const fromEnv = (process.env.REACT_APP_API_BASE_URL || "").replace(/\/+$/, "");
const isLocal = typeof window !== "undefined" && /localhost|127\.0\.0\.1/.test(window.location.hostname);
const DEFAULT_PROD_BASE = "https://appsail-50037613927.development.catalystappsail.in";

export const API_BASE = fromEnv || (isLocal ? "" : DEFAULT_PROD_BASE);
export const SALLA_APP_ID = process.env.REACT_APP_SALLA_APP_ID || "1047822871";
export const BRAND = "ReturnXchange";
