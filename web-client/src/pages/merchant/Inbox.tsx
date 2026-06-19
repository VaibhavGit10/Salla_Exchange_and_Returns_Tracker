import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useI18n } from "../../i18n";
import { MerchantApi } from "../../services/api";
import { Card, StatusPill, ResolutionTag, Spinner, EmptyState, SearchBox, PageHead, money, cx } from "../../components/ui";
import { IconSearch, IconWarranty } from "../../components/icons";

const STATUSES = ["", "requested", "approved", "in_transit", "received", "resolved", "rejected", "cancelled"];

export default function Inbox() {
  const { t } = useI18n();
  const nav = useNavigate();
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    MerchantApi.listReturns({ status, search })
      .then((r) => alive && setRows(r.returns || []))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [status, search]);

  return (
    <div>
      <PageHead title={t("inbox.title")} sub={`${rows.length} ${t("inbox.title").toLowerCase()}`} />

      <div className="between" style={{ marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <div className="tabs">
          {STATUSES.map((s) => (
            <button key={s || "all"} className={cx("tab", status === s && "on")} onClick={() => setStatus(s)}>
              {s ? t(`status.${s}`) : t("common.all")}
            </button>
          ))}
        </div>
        <div style={{ width: 240 }}>
          <SearchBox icon={IconSearch} placeholder={t("common.search")} value={search} onChange={(e: any) => setSearch(e.target.value)} />
        </div>
      </div>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: 18 }}><Spinner label={t("common.loading")} /></div>
        ) : rows.length === 0 ? (
          <EmptyState title={t("inbox.empty")} />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>{t("inbox.col.rma")}</th>
                <th>{t("inbox.col.order")}</th>
                <th>{t("detail.customer")}</th>
                <th>{t("inbox.col.resolution")}</th>
                <th>{t("inbox.col.status")}</th>
                <th>{t("inbox.col.value")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.return_number} onClick={() => nav(`/merchant/inbox/${r.return_number}`)}>
                  <td className="mono" style={{ fontWeight: 600, color: "var(--ink)" }}>
                    <span className="row" style={{ gap: 6 }}>
                      {r.return_number}
                      {r.is_warranty ? <IconWarranty size={13} style={{ color: "var(--ink-4)" }} /> : null}
                    </span>
                  </td>
                  <td className="mono muted">{r.order_number}</td>
                  <td>{r.customer_name || <span className="dim">—</span>}</td>
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
