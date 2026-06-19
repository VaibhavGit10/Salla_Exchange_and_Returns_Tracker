import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useI18n } from "../../i18n";
import { PortalApi } from "../../services/api";
import { Card, Badge, Spinner, EmptyState, money } from "../../components/ui";

export default function Track() {
  const { slug = "" } = useParams();
  const { t } = useI18n();
  const [rows, setRows] = useState<any[] | null>(null);
  const [needAuth, setNeedAuth] = useState(false);

  useEffect(() => {
    PortalApi.listReturns()
      .then((r) => setRows(r.returns || []))
      .catch(() => setNeedAuth(true));
  }, []);

  if (needAuth) {
    return (
      <Card style={{ textAlign: "center" }}>
        <h3>{t("portal.track")}</h3>
        <p className="muted" style={{ fontSize: 14 }}>Verify your order to see your returns.</p>
        <a className="btn btn-primary" href={`#/r/${slug}`}>{t("portal.start.title")}</a>
      </Card>
    );
  }
  if (!rows) return <Card><Spinner label={t("common.loading")} /></Card>;

  return (
    <Card>
      <div className="card-h"><h3>{t("portal.track")}</h3></div>
      {rows.length === 0 ? (
        <EmptyState title={t("inbox.empty")} />
      ) : (
        <div className="stack" style={{ gap: 10 }}>
          {rows.map((r) => (
            <div key={r.return_number} className="item-row" style={{ alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{r.return_number}</div>
                <div className="muted" style={{ fontSize: 12.5 }}>{t(`resolve.${r.requested_resolution}`)} · {money(r.total_request_value)} · {r.requested_at}</div>
              </div>
              <Badge status={r.status}>{t(`status.${r.status}`)}</Badge>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
