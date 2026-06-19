import React, { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Card, PageHead, Button, Callout, useToast } from "../../components/ui";
import { MerchantApi } from "../../services/api";
import { API_BASE, BRAND } from "../../config";
import { IconBuilding, IconLink, IconCode, IconNew, IconReject } from "../../components/icons";

export default function Settings() {
  const { store } = useOutletContext<any>() || {};
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const devTools = !!store?.dev_tools;

  const seed = async () => {
    setBusy(true);
    try {
      const r = await MerchantApi.devSeed();
      toast(`Loaded ${r.created} sample returns`);
      setTimeout(() => window.location.reload(), 900);
    } catch {
      toast("Seed failed (dev mode off?)");
    } finally {
      setBusy(false);
    }
  };
  const clear = async () => {
    setBusy(true);
    try {
      const r = await MerchantApi.devUnseed();
      toast(`Cleared ${r.removed} sample returns`);
      setTimeout(() => window.location.reload(), 900);
    } catch {
      toast("Clear failed");
    } finally {
      setBusy(false);
    }
  };
  const slug = store?.portal_public_slug || "";
  const portalUrl = `${window.location.origin}/app/#/r/${slug}`;
  const snippet = `<script src="${API_BASE || ""}/snippet/returns.js?store=${store?.store_id || ""}" async></script>`;

  return (
    <div>
      <PageHead title="Settings" sub="Store, portal & storefront widget" />
      <div className="stack" style={{ gap: 16 }}>
      <Card>
        <div className="card-h"><h3><IconBuilding size={16} /> Store</h3></div>
        <div className="kv"><span className="k">Name</span><span style={{ fontWeight: 600 }}>{store?.store_name || BRAND}</span></div>
        <div className="kv"><span className="k">Domain</span><span>{store?.store_domain || "—"}</span></div>
        <div className="kv"><span className="k">Store ID</span><span className="mono">{store?.store_id}</span></div>
        <div className="kv"><span className="k">Status</span><span>{store?.status}</span></div>
      </Card>

      <Card>
        <div className="card-h"><h3><IconLink size={16} /> Customer portal</h3></div>
        <p className="muted" style={{ fontSize: 13, marginBottom: 8 }}>Direct link customers can use off-store (email OTP):</p>
        <code className="code-box">{portalUrl}</code>
      </Card>

      <Card>
        <div className="card-h"><h3><IconCode size={16} /> Storefront widget</h3></div>
        <p className="muted" style={{ fontSize: 13, marginBottom: 8 }}>Add this via Salla App Snippets to show a “Returns” button on your storefront:</p>
        <code className="code-box">{snippet}</code>
      </Card>

      {devTools && (
        <Card style={{ borderColor: "var(--accent-rule)" }}>
          <div className="card-h"><h3><IconNew size={16} /> Developer — sample data</h3></div>
          <Callout tone="warn">Dev preview is on. Load demo returns to explore the app, then clear them before going live.</Callout>
          <div className="row" style={{ marginTop: 12 }}>
            <Button icon={IconNew} onClick={seed} disabled={busy}>Load sample data</Button>
            <Button variant="ghost" icon={IconReject} onClick={clear} disabled={busy}>Clear sample data</Button>
          </div>
        </Card>
      )}
      </div>
    </div>
  );
}
