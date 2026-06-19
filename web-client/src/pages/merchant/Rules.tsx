import React, { useEffect, useState } from "react";
import { useI18n } from "../../i18n";
import { MerchantApi } from "../../services/api";
import { Card, Field, Input, Toggle, Button, Spinner, PageHead, Callout, useToast } from "../../components/ui";
import { IconRules, IconCheck } from "../../components/icons";

export default function Rules() {
  const { t } = useI18n();
  const toast = useToast();
  const [r, setR] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    MerchantApi.getRules().then((d) => setR(d.rules));
  }, []);

  if (!r) return <Spinner label={t("common.loading")} />;
  const up = (patch: any) => setR((p: any) => ({ ...p, ...patch }));

  const save = async () => {
    setBusy(true);
    try {
      const res = await MerchantApi.putRules({
        default_return_window_days: Number(r.return_window_days),
        auto_approve_enabled: !!r.auto_approve_enabled,
        auto_approve_max_value: r.auto_approve_max_value === "" || r.auto_approve_max_value == null ? null : Number(r.auto_approve_max_value),
        refund_allowed: !!r.refund_allowed,
        exchange_allowed: !!r.exchange_allowed,
        store_credit_allowed: !!r.store_credit_allowed,
        sku_restrictions: r.sku_restrictions || [],
      });
      setR(res.rules);
      toast(t("rules.saved"));
    } catch {
      toast("Save failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHead title={t("rules.title")} sub="Eligibility & automation" />
      <div className="grid-2">
        <Card>
          <div className="card-h"><h3><IconRules size={16} /> {t("rules.title")}</h3></div>
          <Field label={t("rules.window")}>
            <Input type="number" min={0} max={365} value={r.return_window_days ?? 14} onChange={(e: any) => up({ return_window_days: e.target.value })} />
          </Field>
          <div className="field">
            <Toggle checked={!!r.auto_approve_enabled} onChange={(v) => up({ auto_approve_enabled: v })} label={t("rules.auto")} />
          </div>
          {r.auto_approve_enabled && (
            <Field label={t("rules.auto_max")}>
              <Input type="number" min={0} value={r.auto_approve_max_value ?? ""} onChange={(e: any) => up({ auto_approve_max_value: e.target.value })} placeholder="e.g. 150" />
            </Field>
          )}
          <div className="divider" style={{ margin: "8px 0 14px" }} />
          <div className="stack" style={{ gap: 12, marginBottom: 16 }}>
            <Toggle checked={!!r.refund_allowed} onChange={(v) => up({ refund_allowed: v })} label={t("rules.refund")} />
            <Toggle checked={!!r.exchange_allowed} onChange={(v) => up({ exchange_allowed: v })} label={t("rules.exchange")} />
            <Toggle checked={!!r.store_credit_allowed} onChange={(v) => up({ store_credit_allowed: v })} label={t("rules.credit")} />
          </div>
          <Field label="Non-returnable SKUs (comma separated)">
            <Input
              value={(r.sku_restrictions || []).join(", ")}
              onChange={(e: any) => up({ sku_restrictions: e.target.value.split(",").map((s: string) => s.trim()).filter(Boolean) })}
            />
          </Field>
          <Button icon={IconCheck} onClick={save} disabled={busy}>{t("common.save")}</Button>
        </Card>

        <Card style={{ alignSelf: "start" }}>
          <div className="card-h"><h3>How it works</h3></div>
          <div className="stack" style={{ gap: 12 }}>
            <Callout tone="info">Returns outside the window or for non-returnable SKUs are rejected automatically.</Callout>
            <Callout tone="warn">Auto-approve clears low-value requests instantly — everything else waits for your review.</Callout>
          </div>
        </Card>
      </div>
    </div>
  );
}
