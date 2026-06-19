import React from "react";
import { Card } from "../../components/ui";
import { BRAND } from "../../config";
import { IconSparkle, IconExternal } from "../../components/icons";

export default function Landing() {
  return (
    <div className="center-screen">
      <Card style={{ maxWidth: 540, textAlign: "center" }}>
        <span className="icon-circle"><IconSparkle size={24} /></span>
        <h2 style={{ fontSize: 22 }}>Returns &amp; exchanges that resolve themselves</h2>
        <p className="muted" style={{ fontSize: 14, marginTop: 8 }}>
          {BRAND} runs inside your Salla dashboard — one-click refunds, exchanges &amp; store credit executed via Salla,
          a branded self-serve customer portal, and rules that auto-approve the easy ones.
        </p>
        <div className="row" style={{ justifyContent: "center", marginTop: 16 }}>
          <a className="btn btn-primary" href="#/merchant">Open console</a>
          <a className="btn btn-ghost" href="#/r/demo">View customer portal <IconExternal size={15} /></a>
        </div>
      </Card>
    </div>
  );
}
