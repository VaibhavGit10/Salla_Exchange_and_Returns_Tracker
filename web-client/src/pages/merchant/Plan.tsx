import React from "react";
import { useOutletContext } from "react-router-dom";
import { useI18n } from "../../i18n";
import { Card, Button, PageHead } from "../../components/ui";
import { IconCheck } from "../../components/icons";

const PLANS = [
  { code: "free", name: "Essential", price: "99", per: "SAR/mo", features: ["Up to 50 returns/mo", "Manual approval", "Branded portal"] },
  { code: "business", name: "Business", price: "249", per: "SAR/mo", features: ["Up to 300 returns/mo", "Auto-approve rules", "Reverse-logistics labels"], highlight: true },
  { code: "enterprise", name: "Enterprise", price: "Custom", per: "", features: ["Unlimited returns", "Custom branding", "Priority support + analytics"] },
];

export default function Plan() {
  const { t } = useI18n();
  const { store } = useOutletContext<any>() || {};
  const current = store?.plan_code || "free";
  return (
    <div>
      <PageHead title={t("nav.plan") } sub="Billed via Salla App Subscriptions" />
      <div className="stat-grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))" }}>
        {PLANS.map((p) => (
          <Card key={p.code} style={p.highlight ? { borderColor: "var(--accent)", boxShadow: "var(--sh-2)" } : undefined}>
            <div className="between">
              <h3>{p.name}</h3>
              {current === p.code && <span className="pill approved"><span className="dt" />Current</span>}
            </div>
            <div style={{ margin: "10px 0" }}>
              <span className="mono" style={{ fontSize: 28, fontWeight: 700 }}>{p.price}</span>{" "}
              <span className="muted" style={{ fontSize: 13, fontWeight: 500 }}>{p.per}</span>
            </div>
            <div className="stack" style={{ gap: 8, margin: "0 0 16px" }}>
              {p.features.map((f) => (
                <div key={f} className="row" style={{ gap: 8, fontSize: 13.5, color: "var(--ink-2)" }}>
                  <IconCheck size={15} style={{ color: "var(--ok)" }} /> {f}
                </div>
              ))}
            </div>
            <Button variant={p.highlight ? "primary" : "ghost"} block disabled={current === p.code}>
              {current === p.code ? "Active" : "Choose"}
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}
