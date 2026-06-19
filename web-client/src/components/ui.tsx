import React, { createContext, useCallback, useContext, useState } from "react";
import { motion } from "framer-motion";
import {
  IconCheck, IconReturns, IconSpinner, IconClock, IconReceived, IconTruck, IconReject,
  IconExchange, IconRefund, IconCredit, IconAlert,
} from "./icons";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

type IconType = React.ComponentType<any>;

/* ---------- buttons ---------- */
export function Button({ variant = "primary", size, block, icon: Icon, children, ...rest }: any) {
  return (
    <button className={cx("btn", `btn-${variant}`, size === "sm" && "btn-sm", block && "btn-block")} {...rest}>
      {Icon ? <Icon size={size === "sm" ? 15 : 16} /> : null}
      {children}
    </button>
  );
}

export function Card({ children, className, ...rest }: any) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }} className={cx("card", className)} {...rest}>
      {children}
    </motion.div>
  );
}

export function PageHead({ title, sub, actions }: { title: string; sub?: string; actions?: React.ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h2>{title}</h2>
        {sub && <div className="sub">{sub}</div>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </div>
  );
}

/* ---------- status pills ---------- */
const STATUS_ICON: Record<string, IconType> = {
  requested: IconClock,
  approved: IconCheck,
  in_transit: IconTruck,
  received: IconReceived,
  resolved: IconCheck,
  rejected: IconReject,
  cancelled: IconReject,
};

/** Dot pill — used everywhere a status is shown. */
export function Badge({ status, children }: { status: string; children?: React.ReactNode }) {
  return (
    <span className={cx("pill", status)}>
      <span className="dt" />
      {children ?? status}
    </span>
  );
}

/** Richer pill with a leading status icon (for tables / detail headers). */
export function StatusPill({ status, label }: { status: string; label?: string }) {
  const Icon = STATUS_ICON[status] || IconClock;
  return (
    <span className={cx("pill", status)}>
      <Icon size={13} />
      {label ?? status}
    </span>
  );
}

const RESOLUTION_ICON: Record<string, IconType> = { refund: IconRefund, exchange: IconExchange, store_credit: IconCredit };
export function ResolutionTag({ type, label }: { type: string; label?: string }) {
  const Icon = RESOLUTION_ICON[type] || IconRefund;
  return (
    <span className="row" style={{ gap: 6, color: "var(--ink-2)", fontWeight: 500 }}>
      <Icon size={14} style={{ color: "var(--ink-4)" }} />
      {label ?? type}
    </span>
  );
}

/* ---------- stat tiles ---------- */
export function StatTile({
  label, value, hint, icon: Icon, tone = "accent", feature, mono, delta,
}: {
  label: string; value: React.ReactNode; hint?: string; icon?: IconType;
  tone?: "accent" | "ok" | "info" | "warn" | "cyan" | "grape"; feature?: boolean; mono?: boolean;
  delta?: { dir: "up" | "down" | "flat"; text: string };
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={cx("stat", feature && "feature")}>
      <div className="stat-top">
        <span className={cx("ico-badge", tone)}>{Icon ? <Icon size={18} /> : null}</span>
        {delta && <span className={cx("delta", delta.dir)}>{delta.text}</span>}
      </div>
      <div className="label">{label}</div>
      <div className={cx("value", mono && "mono")}>{value}</div>
      {hint && <div className="hint">{hint}</div>}
    </motion.div>
  );
}

/* ---------- callout ---------- */
export function Callout({ tone = "warn", icon: Icon = IconAlert, children }: { tone?: "warn" | "info" | "bad"; icon?: IconType; children: React.ReactNode }) {
  return (
    <div className={cx("callout", tone)}>
      <Icon size={17} />
      <div>{children}</div>
    </div>
  );
}

/* ---------- stepper ---------- */
export function Stepper({ steps, current, rejected }: { steps: Array<{ key: string; label: string; icon: IconType }>; current: number; rejected?: boolean }) {
  return (
    <div className="stepper">
      {steps.map((s, i) => {
        const state = rejected && i === current ? "rejected" : i < current ? "done" : i === current ? "current" : "";
        const Icon = s.icon;
        return (
          <div key={s.key} className={cx("step", state)}>
            <span className="node">{i < current ? <IconCheck size={16} /> : <Icon size={15} />}</span>
            <span className="lbl">{s.label}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- fields ---------- */
export function Field({ label, hint, error, children }: any) {
  return (
    <div className="field">
      {label && <label>{label}</label>}
      {children}
      {error ? <span className="error-text">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}
export const Input = (props: any) => <input className="input" {...props} />;
export const TextArea = (props: any) => <textarea className="input" rows={3} {...props} />;
export const Select = ({ children, ...props }: any) => (
  <select className="select input" {...props}>{children}</select>
);
export function InputWithIcon({ icon: Icon, ...props }: any) {
  return (
    <span className="input-icon">
      {Icon ? <Icon size={16} /> : null}
      <input className="input" {...props} />
    </span>
  );
}
export function SearchBox({ icon: Icon, ...props }: any) {
  return (
    <span className="searchbox">
      {Icon ? <Icon size={16} /> : null}
      <input {...props} />
    </span>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <label className="row" style={{ cursor: "pointer", gap: 10 }}>
      <span
        onClick={() => onChange(!checked)}
        style={{ width: 42, height: 24, borderRadius: 999, background: checked ? "var(--accent-strong)" : "var(--rule-2)", position: "relative", transition: "background .15s", display: "inline-block", flex: "0 0 auto" }}
      >
        <span style={{ position: "absolute", top: 3, insetInlineStart: checked ? 21 : 3, width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "inset-inline-start .15s", boxShadow: "0 1px 2px rgba(0,0,0,.25)" }} />
      </span>
      {label && <span style={{ fontSize: 13.5 }}>{label}</span>}
    </label>
  );
}

export function Avatar({ name, size = 38 }: { name?: string; size?: number }) {
  const initials = (name || "RX").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.34 }}>{initials}</span>;
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="row" style={{ gap: 9, color: "var(--ink-3)" }}>
      <IconSpinner size={18} className="spin" />
      {label && <span>{label}</span>}
    </div>
  );
}

export function EmptyState({ title, sub, icon: Icon = IconReturns }: { title: string; sub?: string; icon?: IconType }) {
  return (
    <div className="empty">
      <span className="icon-circle"><Icon size={24} /></span>
      <div style={{ fontWeight: 600, color: "var(--ink-2)" }}>{title}</div>
      {sub && <div style={{ fontSize: 13, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export function money(amount?: number | null, currency = "SAR"): string {
  if (amount == null) return "—";
  return `${currency} ${Number(amount).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export function Steps({ total, current }: { total: number; current: number }) {
  return (
    <div className="steps">
      {Array.from({ length: total }).map((_, i) => (
        <span key={i} className={i <= current ? "s on" : "s"} />
      ))}
    </div>
  );
}

/* ---------- toast ---------- */
const ToastCtx = createContext<(msg: string) => void>(() => {});
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  const show = useCallback((m: string) => {
    setMsg(m);
    window.setTimeout(() => setMsg(null), 2600);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && (
        <div className="toast">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="t">
            <IconCheck size={16} />
            {msg}
          </motion.div>
        </div>
      )}
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);
