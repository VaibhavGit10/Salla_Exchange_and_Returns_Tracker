// Client-side token storage. Merchant = embedded session JWT; Portal = customer session token.
const M = "rx_merchant_session";
const P = "rx_portal_session";

function mk(key: string) {
  return {
    get(): string | null {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    set(v: string) {
      try {
        localStorage.setItem(key, v);
      } catch {
        /* ignore */
      }
    },
    clear() {
      try {
        localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    },
  };
}

export const merchantSession = mk(M);
export const portalSession = mk(P);
