// Salla Embedded SDK bootstrap. Inside the Salla dashboard iframe, Salla provides a short-lived
// token; we verify it at /auth/embedded and store the returned session JWT. Outside Salla (dev/
// standalone) this resolves { embedded:false } so the app still renders.
import { API_BASE } from "../config";
import { merchantSession } from "../lib/session";

let sdk: any = null;
const INIT_TIMEOUT_MS = 2500;

function inIframe(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("init timeout")), ms))]);
}
// Salla injects the embedded SDK on the dashboard iframe (window.salla / window.Salla).
// We read it from the global rather than bundling the package, so the build never depends on it.
async function loadSdk(): Promise<any> {
  const w = window as any;
  return w.salla?.embedded || w.Salla?.embedded || w.sallaEmbedded || null;
}

export async function bootstrapEmbedded(): Promise<{ embedded: boolean; storeId?: string }> {
  if (!inIframe()) return { embedded: false };
  const embedded = await loadSdk();
  if (!embedded) return { embedded: false };
  sdk = embedded;
  try {
    await withTimeout(embedded.init({ debug: false }), INIT_TIMEOUT_MS);
  } catch {
    return { embedded: false };
  }
  let token: string | null = null;
  try {
    token = embedded.auth?.getToken?.() || null;
  } catch {
    token = null;
  }
  if (!token) return { embedded: false };

  try {
    const res = await fetch(`${API_BASE}/auth/embedded`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ token }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.token) throw new Error(data?.error || "verification failed");
    merchantSession.set(data.token);
    try {
      embedded.ready();
    } catch {
      /* best effort */
    }
    return { embedded: true, storeId: data.store_id };
  } catch {
    try {
      embedded.destroy();
    } catch {
      /* best effort */
    }
    return { embedded: false };
  }
}

export function refreshEmbeddedAuth(): void {
  try {
    sdk?.auth?.refresh?.();
  } catch {
    /* no-op outside Salla */
  }
}
