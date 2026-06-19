import React from "react";
import { Outlet, useParams } from "react-router-dom";
import { useI18n } from "../i18n";
import { BRAND } from "../config";

export default function PortalShell() {
  const { lang, setLang } = useI18n();
  const { slug } = useParams();
  return (
    <div className="portal">
      <div className="wrap">
        <div className="between" style={{ marginBottom: 8 }}>
          <span className="muted" style={{ fontSize: 12, fontWeight: 600 }}>{BRAND}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setLang(lang === "ar" ? "en" : "ar")}>
            {lang === "ar" ? "EN" : "عربي"}
          </button>
        </div>
        <Outlet context={{ slug }} />
      </div>
    </div>
  );
}
