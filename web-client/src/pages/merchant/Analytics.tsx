import React, { useEffect, useState } from "react";
import { useI18n } from "../../i18n";
import { MerchantApi } from "../../services/api";
import { Card, StatTile, Spinner, PageHead, money } from "../../components/ui";
import { IconTrend, IconAnalytics, IconCredit, IconMoney } from "../../components/icons";

export default function Analytics() {
  const { t } = useI18n();
  const [k, setK] = useState<any>(null);
  useEffect(() => {
    MerchantApi.analytics().then((d) => setK(d.kpis));
  }, []);
  if (!k) return <Spinner label={t("common.loading")} />;

  const total = (k.retention?.exchanges ?? 0) + (k.resolved_recent ?? 0) || 1;
  const exPct = Math.round(((k.retention?.exchanges ?? 0) / total) * 100);

  return (
    <div>
      <PageHead title={t("nav.analytics")} sub={t("kpi.this_month")} />
      <div className="stat-grid" style={{ marginBottom: 18 }}>
        <StatTile feature icon={IconTrend} label={t("kpi.automation")} value={`${k.this_month?.automation_pct ?? 0}%`} hint={`${k.this_month?.auto_approved ?? 0} / ${k.this_month?.returns_created ?? 0}`} />
        <StatTile tone="ok" icon={IconAnalytics} label="Revenue retained" value={`${exPct}%`} hint={t("kpi.exchanges")} />
        <StatTile tone="ok" icon={IconCredit} label={t("kpi.credit")} value={money(k.retention?.store_credit_value ?? 0)} mono />
        <StatTile tone="warn" icon={IconMoney} label={t("kpi.refunded")} value={money(k.retention?.cash_refunded_value ?? 0)} mono />
      </div>
      <Card>
        <div className="card-h"><h3><IconAnalytics size={16} /> {t("nav.analytics")}</h3></div>
        <p className="muted" style={{ fontSize: 14 }}>
          {t("kpi.this_month")}: <b>{k.this_month?.returns_created ?? 0}</b> returns · <b>{k.this_month?.automation_pct ?? 0}%</b> auto-approved ·
          avg resolution <b>{k.avg_resolution_hours ?? 0} {t("kpi.hours")}</b>.
        </p>
        <p className="muted" style={{ fontSize: 13 }}>Reason-by-SKU breakdown ships in the next iteration (uses the returns ledger).</p>
      </Card>
    </div>
  );
}
