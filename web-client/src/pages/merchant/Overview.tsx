import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useI18n } from "../../i18n";
import { MerchantApi } from "../../services/api";
import { Card, StatTile, StatusPill, ResolutionTag, Spinner, EmptyState, PageHead, Button, money } from "../../components/ui";
import { IconClock, IconTruck, IconTrend, IconReceived, IconReturns, IconExchange, IconCredit, IconMoney, IconNext } from "../../components/icons";

export default function Overview() {
  const { t } = useI18n();
  const nav = useNavigate();
  const [kpis, setKpis] = useState<any>(null);
  const [recent, setRecent] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [o, r] = await Promise.all([MerchantApi.overview(), MerchantApi.listReturns({ limit: 6 })]);
        setKpis(o.kpis);
        setRecent(r.returns || []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <Spinner label={t("common.loading")} />;
  const k = kpis || {};
  const auto = k.this_month?.automation_pct ?? 0;

  return (
    <div>
      <PageHead
        title={t("nav.overview")}
        sub={t("kpi.this_month")}
        actions={<Button icon={IconReturns} onClick={() => nav("/merchant/inbox")}>{t("inbox.title")}</Button>}
      />

      <div className="stat-grid">
        <StatTile feature icon={IconClock} label={t("kpi.awaiting")} value={k.awaiting_action ?? 0} hint="needs review" />
        <StatTile tone="info" icon={IconTruck} label={t("kpi.in_transit")} value={k.in_transit ?? 0} />
        <StatTile tone="ok" icon={IconTrend} label={t("kpi.automation")} value={`${auto}%`} delta={{ dir: auto >= 50 ? "up" : "flat", text: `${k.this_month?.auto_approved ?? 0}/${k.this_month?.returns_created ?? 0}` }} />
        <StatTile tone="cyan" icon={IconReceived} label={t("kpi.avg_resolution")} value={`${k.avg_resolution_hours ?? 0}${t("kpi.hours")}`} />
      </div>

      <div className="stat-grid" style={{ marginTop: 14 }}>
        <StatTile tone="grape" icon={IconExchange} label={t("kpi.exchanges")} value={k.retention?.exchanges ?? 0} />
        <StatTile tone="ok" icon={IconCredit} label={t("kpi.credit")} value={money(k.retention?.store_credit_value ?? 0)} mono />
        <StatTile tone="warn" icon={IconMoney} label={t("kpi.refunded")} value={money(k.retention?.cash_refunded_value ?? 0)} mono />
        <StatTile tone="ok" icon={IconReceived} label={t("kpi.resolved")} value={k.resolved_recent ?? 0} />
      </div>

      <Card style={{ marginTop: 18 }}>
        <div className="card-h">
          <h3><IconReturns size={17} /> {t("inbox.title")}</h3>
          <a className="btn btn-ghost btn-sm" href="#/merchant/inbox">{t("common.all")} <IconNext size={14} /></a>
        </div>
        {recent.length === 0 ? (
          <EmptyState title={t("inbox.empty")} />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>{t("inbox.col.rma")}</th>
                <th>{t("inbox.col.order")}</th>
                <th>{t("inbox.col.resolution")}</th>
                <th>{t("inbox.col.status")}</th>
                <th>{t("inbox.col.value")}</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((r) => (
                <tr key={r.return_number} onClick={() => nav(`/merchant/inbox/${r.return_number}`)}>
                  <td className="mono" style={{ fontWeight: 600, color: "var(--ink)" }}>{r.return_number}</td>
                  <td className="mono muted">{r.order_number}</td>
                  <td><ResolutionTag type={r.requested_resolution} label={t(`resolve.${r.requested_resolution}`)} /></td>
                  <td><StatusPill status={r.status} label={t(`status.${r.status}`)} /></td>
                  <td className="mono">{money(r.total_request_value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
