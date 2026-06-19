import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useI18n } from "../../i18n";
import { PortalApi } from "../../services/api";
import { flow } from "../../lib/flow";
import { ApiError } from "../../services/http";
import { Card, Field, Input, Button, Steps, cx, useToast } from "../../components/ui";
import { IconRefund, IconExchange, IconCredit } from "../../components/icons";

const OPTIONS = [
  { key: "refund", Icon: IconRefund },
  { key: "exchange", Icon: IconExchange },
  { key: "store_credit", Icon: IconCredit },
] as const;

export default function Resolution() {
  const { slug = "" } = useParams();
  const nav = useNavigate();
  const { t } = useI18n();
  const toast = useToast();
  const f = flow.get();
  const [res, setRes] = useState<string>("refund");
  const [iban, setIban] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!f.selected?.length) nav(`/r/${slug}/items`);
  }, [f.selected, nav, slug]);

  const isCod = /cod|cash/i.test(String(f.order?.payment_method || ""));
  const needsIban = res === "refund" && isCod;

  const submit = async () => {
    setBusy(true);
    try {
      const items = res === "exchange" ? (f.selected || []).map((it) => ({ ...it, exchange_variant_id: it.sku })) : f.selected;
      const created = await PortalApi.createReturn({
        requested_resolution: res,
        items,
        order_id_external: f.order?.id != null ? String(f.order.id) : undefined,
        customer_email: f.contact,
        ...(needsIban && iban.trim() ? { bank_iban: iban.trim() } : {}),
      });
      const rma = created?.return_number;
      // best-effort photo upload (required by policy for defective; merchant rules enforce)
      for (const file of files.slice(0, 5)) {
        await PortalApi.uploadAttachment(rma, file).catch(() => {});
      }
      flow.set({ return_number: rma, resolution: res });
      nav(`/r/${slug}/success`);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Could not submit");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="hero">
        <h2>{t("portal.res.title")}</h2>
      </div>
      <Card>
        <Steps total={4} current={3} />
        <div className="stat-grid" style={{ gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 14 }}>
          {OPTIONS.map((o) => (
            <div key={o.key} className={cx("choice", res === o.key && "sel")} onClick={() => setRes(o.key)}>
              <o.Icon size={20} />
              {t(`resolve.${o.key}`)}
            </div>
          ))}
        </div>
        {needsIban && (
          <Field label="IBAN (for COD refund)" hint="Cash-on-delivery orders are refunded by bank transfer">
            <Input value={iban} onChange={(e: any) => setIban(e.target.value)} placeholder="SA00 0000 0000 0000 0000 0000" />
          </Field>
        )}
        <Field label={t("detail.attachments")} hint="Photos help speed up approval (required for damaged items)">
          <input type="file" accept="image/png,image/jpeg" multiple onChange={(e) => setFiles(Array.from(e.target.files || []))} />
        </Field>
        <Button block onClick={submit} disabled={busy || (needsIban && !iban.trim())}>{t("common.submit")}</Button>
      </Card>
    </>
  );
}
