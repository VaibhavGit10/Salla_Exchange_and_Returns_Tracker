import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useI18n } from "../../i18n";
import { PortalApi } from "../../services/api";
import { flow } from "../../lib/flow";
import { Card, Button, Select, Spinner, Steps, money, cx, useToast } from "../../components/ui";
import { IconReturns } from "../../components/icons";

const REASONS = ["defective", "wrong_item", "not_as_described", "changed_mind", "size_issue", "other"];

export default function Items() {
  const { slug = "" } = useParams();
  const nav = useNavigate();
  const { t } = useI18n();
  const toast = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<Record<string, { on: boolean; reason: string }>>({});

  useEffect(() => {
    PortalApi.orderItems()
      .then((r) => {
        setItems(r.items || []);
        flow.set({ order: r.order });
      })
      .catch(() => toast("Could not load order"))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line

  const toggle = (id: string) => setSel((p) => ({ ...p, [id]: { on: !p[id]?.on, reason: p[id]?.reason || "defective" } }));
  const setReason = (id: string, reason: string) => setSel((p) => ({ ...p, [id]: { on: true, reason } }));

  const next = () => {
    const selected = items
      .filter((it) => sel[String(it.id)]?.on)
      .map((it) => ({
        order_item_id_external: String(it.id),
        sku: it.sku || String(it.product_id || it.id),
        product_name: it.product_name,
        category_id_external: it.categories?.[0]?.id ? String(it.categories[0].id) : undefined,
        category_name: it.categories?.[0]?.name,
        quantity: 1,
        unit_price: it.price?.amount,
        reason_code: sel[String(it.id)].reason,
      }));
    if (!selected.length) return toast("Select at least one item");
    flow.set({ selected });
    nav(`/r/${slug}/resolution`);
  };

  if (loading) return <Card><Spinner label={t("common.loading")} /></Card>;

  return (
    <>
      <div className="hero">
        <h2>{t("portal.items.title")}</h2>
      </div>
      <Card>
        <Steps total={4} current={2} />
        <div className="stack" style={{ gap: 8 }}>
          {items.map((it) => {
            const id = String(it.id);
            const s = sel[id];
            return (
              <div key={id} className={cx("item-row", s?.on && "sel")}>
                <input type="checkbox" checked={!!s?.on} onChange={() => toggle(id)} style={{ width: 18, height: 18 }} />
                {it.thumbnail ? <img src={it.thumbnail} alt="" /> : <span className="item-ph"><IconReturns size={20} /></span>}
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{it.product_name || it.sku}</div>
                  <div className="muted" style={{ fontSize: 12.5 }}>×{it.quantity} · {money(it.price?.amount, it.price?.currency)}</div>
                  {s?.on && (
                    <div style={{ marginTop: 8 }}>
                      <Select value={s.reason} onChange={(e: any) => setReason(id, e.target.value)}>
                        {REASONS.map((r) => (
                          <option key={r} value={r}>{t(`reason.${r}`)}</option>
                        ))}
                      </Select>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <Button block onClick={next} style={{ marginTop: 14 }}>{t("common.next")}</Button>
      </Card>
    </>
  );
}
