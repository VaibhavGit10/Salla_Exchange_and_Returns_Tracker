import React from "react";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";

import MerchantShell from "../components/MerchantShell";
import PortalShell from "../components/PortalShell";

import Landing from "../pages/shared/Landing";
import NotFound from "../pages/shared/NotFound";

import Overview from "../pages/merchant/Overview";
import Inbox from "../pages/merchant/Inbox";
import ReturnDetail from "../pages/merchant/ReturnDetail";
import Rules from "../pages/merchant/Rules";
import Analytics from "../pages/merchant/Analytics";
import Plan from "../pages/merchant/Plan";
import Settings from "../pages/merchant/Settings";

import Start from "../pages/portal/Start";
import Verify from "../pages/portal/Verify";
import Items from "../pages/portal/Items";
import Resolution from "../pages/portal/Resolution";
import Success from "../pages/portal/Success";
import Track from "../pages/portal/Track";

export function AppRouter() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Landing />} />

        <Route path="/merchant" element={<MerchantShell />}>
          <Route index element={<Navigate to="overview" replace />} />
          <Route path="overview" element={<Overview />} />
          <Route path="inbox" element={<Inbox />} />
          <Route path="inbox/:rma" element={<ReturnDetail />} />
          <Route path="rules" element={<Rules />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="plan" element={<Plan />} />
          <Route path="settings" element={<Settings />} />
        </Route>

        <Route path="/r/:slug" element={<PortalShell />}>
          <Route index element={<Start />} />
          <Route path="verify" element={<Verify />} />
          <Route path="items" element={<Items />} />
          <Route path="resolution" element={<Resolution />} />
          <Route path="success" element={<Success />} />
          <Route path="track" element={<Track />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </HashRouter>
  );
}
