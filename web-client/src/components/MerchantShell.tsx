import React, { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useI18n } from "../i18n";
import { BRAND, API_BASE } from "../config";
import { bootstrapEmbedded } from "../auth/embedded";
import { merchantSession } from "../lib/session";
import { MerchantApi } from "../services/api";
import { Button, Spinner, Avatar, SearchBox } from "./ui";
import {
  IconOverview, IconReturns, IconRules, IconAnalytics, IconPlan, IconSettings, IconStore,
  IconSparkle, IconExternal, IconBell, IconSwitch, IconHelp, IconSearch,
} from "./icons";

const WORKSPACE = [
  { to: "overview", key: "nav.overview", Icon: IconOverview },
  { to: "inbox", key: "nav.inbox", Icon: IconReturns, badge: "new" },
  { to: "analytics", key: "nav.analytics", Icon: IconAnalytics },
];
const SETTINGS = [
  { to: "rules", key: "nav.rules", Icon: IconRules },
  { to: "plan", key: "nav.plan", Icon: IconPlan },
  { to: "settings", key: "nav.settings", Icon: IconSettings },
];

export default function MerchantShell() {
  const { t, lang, setLang } = useI18n();
  const nav = useNavigate();
  const [status, setStatus] = useState<"loading" | "ready" | "connect">("loading");
  const [store, setStore] = useState<any>(null);

  useEffect(() => {
    (async () => {
      if (!merchantSession.get()) await bootstrapEmbedded();
      try {
        const me = await MerchantApi.me();
        setStore(me?.data ?? null);
        setStatus("ready");
        return;
      } catch {
        /* not authenticated — try dev preview (404s in production) */
      }
      try {
        const r = await fetch(`${API_BASE}/auth/dev-login`, { method: "POST", headers: { Accept: "application/json" } });
        if (r.ok) {
          const d = await r.json();
          if (d?.token) {
            merchantSession.set(d.token);
            const me = await MerchantApi.me();
            setStore(me?.data ?? null);
            setStatus("ready");
            return;
          }
        }
      } catch {
        /* dev-login unavailable */
      }
      setStatus("connect");
    })();
  }, []);

  if (status === "loading") {
    return <div className="center-screen"><Spinner label={t("common.loading")} /></div>;
  }

  if (status === "connect") {
    return (
      <div className="center-screen">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="card" style={{ maxWidth: 440, textAlign: "center" }}>
          <span className="icon-circle"><IconStore size={24} /></span>
          <h3>Open from your Salla dashboard</h3>
          <p className="muted" style={{ fontSize: 13.5, marginTop: 6 }}>
            {BRAND} runs embedded inside Salla. Install it and open it from your store dashboard to manage returns.
          </p>
          <div style={{ marginTop: 14 }}>
            <Button icon={IconExternal} onClick={() => (window.location.href = `${API_BASE}/auth/install`)}>Connect store</Button>
          </div>
        </motion.div>
      </div>
    );
  }

  const storeName = store?.store_name || "Salla store";

  return (
    <div className="rx-shell">
      <aside className="rx-sidebar">
        <div className="rx-brand">
          <span className="mark"><IconSparkle size={17} /></span>
          {BRAND}
        </div>

        <div className="store-chip" title={storeName}>
          <span className="ava">{(storeName || "RX").slice(0, 1).toUpperCase()}</span>
          <span className="nm">{storeName}</span>
          <IconSwitch size={15} />
        </div>

        <div className="nav-section">Workspace</div>
        <nav className="rx-nav">
          {WORKSPACE.map((n) => (
            <NavLink key={n.to} to={n.to} className={({ isActive }) => (isActive ? "active" : "")}>
              <n.Icon size={18} /> {t(n.key)}
              {n.badge === "new" && <span className="pill-new">New</span>}
            </NavLink>
          ))}
        </nav>

        <div className="nav-section">Settings</div>
        <nav className="rx-nav">
          {SETTINGS.map((n) => (
            <NavLink key={n.to} to={n.to} className={({ isActive }) => (isActive ? "active" : "")}>
              <n.Icon size={18} /> {t(n.key)}
            </NavLink>
          ))}
        </nav>

        <div className="rx-side-foot">
          <div className="help-card">
            <div className="h">Need help?</div>
            <div className="s">Docs, setup &amp; Salla install guide.</div>
            <a href="#/merchant/settings"><IconHelp size={14} /> Open guide</a>
          </div>
        </div>
      </aside>

      <div className="rx-main">
        <header className="rx-topbar">
          <div className="title">
            <h1>{storeName}</h1>
            <div className="sub">{store?.store_domain || "Salla store"}</div>
          </div>
          <SearchBox
            icon={IconSearch}
            placeholder={t("common.search") + " — RMA, order…"}
            onKeyDown={(e: any) => {
              if (e.key === "Enter") nav("/merchant/inbox");
            }}
          />
          <button className="icon-btn" aria-label="Notifications"><IconBell size={18} /><span className="dot" /></button>
          <button className="icon-btn" aria-label="Language" onClick={() => setLang(lang === "ar" ? "en" : "ar")} style={{ fontSize: 12, fontWeight: 700 }}>
            {lang === "ar" ? "EN" : "ع"}
          </button>
          <Avatar name={storeName} />
        </header>
        <main className="rx-content">
          <Outlet context={{ store }} />
        </main>
      </div>
    </div>
  );
}
