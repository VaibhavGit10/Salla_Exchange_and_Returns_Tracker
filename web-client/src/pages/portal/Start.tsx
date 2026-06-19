import React, { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useI18n } from "../../i18n";
import { PortalApi } from "../../services/api";
import { flow } from "../../lib/flow";
import { ApiError } from "../../services/http";
import { Card, Field, InputWithIcon, Button, Steps, useToast } from "../../components/ui";
import { IconReturns, IconMail, IconClipboard } from "../../components/icons";

export default function Start() {
  const { slug = "" } = useParams();
  const nav = useNavigate();
  const { t } = useI18n();
  const toast = useToast();
  const [order, setOrder] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [dev, setDev] = useState<string | undefined>();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await PortalApi.requestOtp({ portal_public_slug: slug, order_number: order.trim(), channel: "email", contact: email.trim() });
      flow.set({ slug, order_number: order.trim(), channel: "email", contact: email.trim() });
      if (res?.otp_dev) {
        setDev(res.otp_dev);
        return;
      }
      nav(`/r/${slug}/verify`);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Failed to send code");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="hero">
        <span className="icon-circle"><IconReturns size={24} /></span>
        <h2>{t("portal.start.title")}</h2>
      </div>
      <Card>
        <Steps total={4} current={0} />
        <form onSubmit={submit}>
          <Field label={t("portal.start.order")}>
            <InputWithIcon icon={IconClipboard} value={order} onChange={(e: any) => setOrder(e.target.value)} required placeholder="#12345" />
          </Field>
          <Field label={t("portal.start.email")}>
            <InputWithIcon icon={IconMail} type="email" value={email} onChange={(e: any) => setEmail(e.target.value)} required placeholder="you@example.com" />
          </Field>
          <Button block type="submit" disabled={busy}>{t("portal.start.send")}</Button>
        </form>
        {dev && (
          <div style={{ marginTop: 12, textAlign: "center" }}>
            <p className="hint">Dev code: <b>{dev}</b></p>
            <Button variant="ghost" size="sm" onClick={() => nav(`/r/${slug}/verify`)}>{t("common.next")}</Button>
          </div>
        )}
        <div style={{ textAlign: "center", marginTop: 14 }}>
          <a className="muted" style={{ fontSize: 13 }} href={`#/r/${slug}/track`}>{t("portal.track")} →</a>
        </div>
      </Card>
    </>
  );
}
