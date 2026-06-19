import React, { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useI18n } from "../../i18n";
import { MerchantApi } from "../../services/api";
import { Card, StatusPill, ResolutionTag, Spinner, Button, Field, Input, TextArea, Select, Callout, Stepper, money, useToast } from "../../components/ui";
import { IconWarranty, IconTruck, IconAttach, IconReturns, IconClipboard, IconCheck, IconReject, IconReceived, IconBack, IconClock } from "../../components/icons";
import { ApiError } from "../../services/http";

const STEPS = [
  { key: "requested", label: "Requested", icon: IconClock },
  { key: "approved", label: "Approved", icon: IconCheck },
  { key: "in_transit", label: "In transit", icon: IconTruck },
  { key: "received", label: "Received", icon: IconReceived },
  { key: "resolved", label: "Resolved", icon: IconCheck },
];

export default function ReturnDetail() {
  const { rma = "" } = useParams();
  const { t } = useI18n();
  const toast = useToast();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState<"reject" | "resolve" | null>(null);
  const [reason, setReason] = useState("");
  const [resType, setResType] = useState("refund");
  const [resRef, setResRef] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await MerchantApi.getReturn(rma));
    } finally {
      setLoading(false);
    }
  }, [rma]);

  useEffect(() => { load(); }, [load]);

  const run = async (fn: () => Promise<any>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast(ok);
      setPanel(null);
      setReason("");
      setResRef("");
      await load();
    } catch (e: any) {
      toast(e instanceof ApiError ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Spinner label={t("common.loading")} />;
  if (!data?.return) return <Card>Not found</Card>;

  const r = data.return;
  const status = String(r.status);
  const rejected = status === "rejected" || status === "cancelled";
  const stepIndex = rejected ? 0 : Math.max(0, STEPS.findIndex((s) => s.key === status));
  const isCod = /cod|cash/i.test(String(r.payment_method || ""));

  return (
    <div className="stack" style={{ gap: 16 }}>
      <a className="row muted" href="#/merchant/inbox" style={{ fontSize: 13, gap: 4, fontWeight: 600 }}><IconBack size={15} /> {t("inbox.title")}</a>

      <Card>
        <div className="between" style={{ alignItems: "flex-start" }}>
          <div>
            <div className="row" style={{ gap: 10 }}>
              <h2 className="mono" style={{ fontSize: 19 }}>{r.return_number}</h2>
              <StatusPill status={status} label={t(`status.${status}`)} />
              {r.is_warranty ? <span className="pill grape"><IconWarranty size={12} /> warranty</span> : null}
            </div>
            <div className="muted" style={{ fontSize: 13, marginTop: 5 }}>
              {t("inbox.col.order")} <span className="mono">{r.order_number}</span> · <ResolutionTag type={r.requested_resolution} label={t(`resolve.${r.requested_resolution}`)} /> · <span className="mono">{money(r.total_request_value)}</span>
            </div>
            {(r.customer_name || r.customer_email) && (
              <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                {t("detail.customer")}: <strong style={{ color: "var(--ink-2)" }}>{r.customer_name || r.customer_email}</strong>
                {r.customer_name && r.customer_email ? ` · ${r.customer_email}` : ""}
              </div>
            )}
            {(r.order_date || r.order_source) && (
              <div className="muted" style={{ fontSize: 12.5, marginTop: 1 }}>
                {r.order_date ? `Ordered ${String(r.order_date).slice(0, 16)}` : ""}{r.order_source ? ` · via ${r.order_source}` : ""}
              </div>
            )}
            {r.receiver && (r.receiver.name || r.receiver.phone) && (
              <div className="muted" style={{ fontSize: 12.5 }}>Ship-to: {r.receiver.name || ""}{r.receiver.phone ? ` · ${r.receiver.phone}` : ""}</div>
            )}
          </div>
          <div className="row">
            {status === "requested" && (
              <>
                <Button variant="success" icon={IconCheck} onClick={() => run(() => MerchantApi.approve(rma), "Approved")} disabled={busy}>{t("detail.approve")}</Button>
                <Button variant="danger" icon={IconReject} onClick={() => setPanel(panel === "reject" ? null : "reject")} disabled={busy}>{t("detail.reject")}</Button>
              </>
            )}
            {(status === "approved" || status === "in_transit") && (
              <Button icon={IconReceived} onClick={() => run(() => MerchantApi.receive(rma), "Marked received")} disabled={busy}>{t("detail.receive")}</Button>
            )}
            {status === "received" && (
              <Button icon={IconCheck} onClick={() => setPanel(panel === "resolve" ? null : "resolve")} disabled={busy}>{t("detail.resolve")}</Button>
            )}
          </div>
        </div>

        <div style={{ marginTop: 20 }}>
          <Stepper steps={STEPS} current={rejected ? stepIndex : stepIndex} rejected={rejected} />
        </div>

        {panel === "reject" && (
          <div className="card" style={{ marginTop: 16, background: "var(--card-2)" }}>
            <Field label={t("detail.reason")}>
              <TextArea value={reason} onChange={(e: any) => setReason(e.target.value)} placeholder="Reason shown to the customer" />
            </Field>
            <Button variant="danger" icon={IconReject} disabled={busy || !reason.trim()} onClick={() => run(() => MerchantApi.reject(rma, { status_reason: reason.trim() }), "Rejected")}>{t("detail.reject")}</Button>
          </div>
        )}

        {panel === "resolve" && (
          <div className="card" style={{ marginTop: 16, background: "var(--card-2)" }}>
            <h3 style={{ fontSize: 15, marginBottom: 12 }}>{t("resolve.title")}</h3>
            {isCod && resType === "refund" && (
              <div style={{ marginBottom: 12 }}>
                <Callout tone="warn">COD order — original-payment refunds aren't possible. Use the customer's IBAN (collected at request) or store credit.</Callout>
              </div>
            )}
            <Field label={t("inbox.col.resolution")}>
              <Select value={resType} onChange={(e: any) => setResType(e.target.value)}>
                <option value="refund">{t("resolve.refund")}</option>
                <option value="exchange">{t("resolve.exchange")}</option>
                <option value="store_credit">{t("resolve.store_credit")}</option>
              </Select>
            </Field>
            <Field label={t("resolve.reference")} hint="Leave blank to auto-execute via Salla where supported">
              <Input value={resRef} onChange={(e: any) => setResRef(e.target.value)} placeholder="refund / order / voucher id" />
            </Field>
            <Button icon={IconCheck} disabled={busy} onClick={() => run(() => MerchantApi.resolve(rma, { type: resType, reference: resRef.trim() || undefined }), "Resolved")}>{t("resolve.execute")}</Button>
          </div>
        )}
      </Card>

      <div className="grid-2">
        <Card>
          <div className="card-h"><h3><IconReturns size={16} /> {t("detail.items")}</h3></div>
          <div className="stack" style={{ gap: 8 }}>
            {(data.items || []).map((it: any) => (
              <div key={it.ROWID || it.sku} className="item-row">
                <span className="item-ph"><IconReturns size={20} /></span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{it.product_name || it.sku}</div>
                  <div className="muted" style={{ fontSize: 12.5 }}>
                    {it.variant_name ? `${it.variant_name} · ` : ""}×{it.quantity} · {t(`reason.${it.reason_code}`)}
                  </div>
                  {it.reason_note && <div className="muted" style={{ fontSize: 12 }}>“{it.reason_note}”</div>}
                </div>
                <StatusPill status={it.decision === "approved" ? "approved" : it.decision === "rejected" ? "rejected" : "requested"} label={it.decision} />
              </div>
            ))}
          </div>
          {data.shipment && (
            <div className="row muted" style={{ fontSize: 13, marginTop: 12, gap: 7 }}>
              <IconTruck size={15} /> {data.shipment.mode} · {data.shipment.status}
              {data.shipment.tracking_number ? <span className="mono"> · {data.shipment.tracking_number}</span> : null}
            </div>
          )}
          {data.attachments?.length ? (
            <div className="row muted" style={{ fontSize: 13, marginTop: 8, gap: 7 }}>
              <IconAttach size={15} /> {data.attachments.length} {t("detail.attachments")}
            </div>
          ) : null}
        </Card>

        <Card>
          <div className="card-h"><h3><IconClipboard size={16} /> {t("detail.timeline")}</h3></div>
          <div className="timeline">
            {(data.timeline || []).map((ev: any, i: number) => (
              <div className="ev" key={i}>
                <div style={{ fontWeight: 600, fontSize: 13.5 }}>{ev.event_type}</div>
                <div className="muted" style={{ fontSize: 12 }}>{ev.actor_type} · <span className="mono">{ev.event_time}</span></div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
