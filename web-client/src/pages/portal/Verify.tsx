import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useI18n } from "../../i18n";
import { PortalApi } from "../../services/api";
import { flow } from "../../lib/flow";
import { ApiError } from "../../services/http";
import { Card, Field, Input, Button, Steps, useToast } from "../../components/ui";
import { IconKey } from "../../components/icons";

export default function Verify() {
  const { slug = "" } = useParams();
  const nav = useNavigate();
  const { t } = useI18n();
  const toast = useToast();
  const f = flow.get();
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!f.order_number) nav(`/r/${slug}`);
  }, [f.order_number, nav, slug]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await PortalApi.verifyOtp({ portal_public_slug: f.slug, order_number: f.order_number, channel: f.channel, contact: f.contact, otp: otp.trim() });
      nav(`/r/${slug}/items`);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Invalid code");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="hero">
        <span className="icon-circle"><IconKey size={24} /></span>
        <h2>{t("portal.verify.title")}</h2>
        <p className="muted" style={{ fontSize: 13.5 }}>{t("portal.verify.hint")}</p>
      </div>
      <Card>
        <Steps total={4} current={1} />
        <form onSubmit={submit}>
          <Field>
            <Input
              className="input otp-input"
              value={otp}
              onChange={(e: any) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              placeholder="······"
              required
            />
          </Field>
          <Button block type="submit" disabled={busy || otp.length !== 6}>{t("portal.verify.verify")}</Button>
        </form>
      </Card>
    </>
  );
}
