// Ephemeral customer-flow state (sessionStorage) passed across portal steps.
const KEY = "rx_flow";

export type Flow = {
  slug?: string;
  order_number?: string;
  channel?: string;
  contact?: string;
  order?: any;
  selected?: any[];
  resolution?: string;
  return_number?: string;
};

export const flow = {
  get(): Flow {
    try {
      return JSON.parse(sessionStorage.getItem(KEY) || "{}");
    } catch {
      return {};
    }
  },
  set(patch: Flow): Flow {
    const next = { ...this.get(), ...patch };
    try {
      sessionStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    return next;
  },
  clear() {
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  },
};
