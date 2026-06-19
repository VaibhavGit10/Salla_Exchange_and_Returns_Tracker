// appsail/src/routes/snippet.routes.ts
// GET /snippet/returns.js — storefront widget loader injected via Salla App Snippets.
// Renders a floating "Request / Track a Return" button that deep-links the customer into the
// branded ReturnXchange portal for their store. Public + cached (no secrets, tenant via slug).
import { Router } from "express";
import { env } from "../env";
import { TenantsRepo } from "../repositories/tenants.repo";

export const snippetRoutes = Router();

function jsString(s: string): string {
  return JSON.stringify(String(s ?? ""));
}

snippetRoutes.get("/returns.js", async (req: any, res) => {
  const slug = String(req.query.slug || "").trim();
  const storeId = String(req.query.store || req.query.store_id || "").trim();

  let portalSlug = slug;
  if (!portalSlug && storeId) {
    const tenant = await TenantsRepo.findBySallaStoreId(req, storeId).catch(() => null);
    portalSlug = tenant?.portal_public_slug || "";
  }

  const dashboard = String(env.DASHBOARD_URL || env.APP_BASE_URL || "").replace(/\/+$/, "");
  const portalUrl = portalSlug ? `${dashboard}/#/r/${encodeURIComponent(portalSlug)}` : `${dashboard}/`;
  const label = String(req.query.label || "Returns & Exchanges");

  const js = `(function(){
  try {
    if (window.__returnxchange_loaded) return; window.__returnxchange_loaded = true;
    var url = ${jsString(portalUrl)};
    var label = ${jsString(label)};
    var btn = document.createElement('button');
    btn.textContent = label;
    btn.setAttribute('aria-label', label);
    btn.style.cssText = 'position:fixed;inset-inline-end:18px;bottom:18px;z-index:99999;'
      + 'background:#111827;color:#fff;border:none;border-radius:999px;padding:12px 18px;'
      + 'font:600 14px system-ui,Segoe UI,Arial,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.18);'
      + 'cursor:pointer;transition:transform .15s ease';
    btn.onmouseenter=function(){btn.style.transform='translateY(-2px)';};
    btn.onmouseleave=function(){btn.style.transform='none';};
    btn.onclick=function(){ window.open(url, '_blank', 'noopener'); };
    document.body.appendChild(btn);
  } catch (e) { /* no-op */ }
})();`;

  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300");
  res.status(200).send(js);
});
