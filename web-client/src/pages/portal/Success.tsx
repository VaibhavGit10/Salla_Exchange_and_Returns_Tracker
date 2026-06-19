import React from "react";
import { useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { useI18n } from "../../i18n";
import { flow } from "../../lib/flow";
import { Card } from "../../components/ui";
import { IconCheck } from "../../components/icons";

export default function Success() {
  const { slug = "" } = useParams();
  const { t } = useI18n();
  const f = flow.get();

  return (
    <Card style={{ textAlign: "center" }}>
      <motion.span initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 200 }} className="icon-circle ok" style={{ width: 60, height: 60 }}>
        <IconCheck size={30} />
      </motion.span>
      <h2 style={{ marginTop: 10 }}>{t("portal.success.title")}</h2>
      {f.return_number && (
        <p className="mono" style={{ fontSize: 17, fontWeight: 700, letterSpacing: 0.5, margin: "6px 0" }}>{f.return_number}</p>
      )}
      <p className="muted" style={{ fontSize: 14 }}>{t("portal.success.sub")}</p>
      <div className="row" style={{ justifyContent: "center", marginTop: 14 }}>
        <a className="btn btn-primary" href={`#/r/${slug}/track`}>{t("portal.track")}</a>
        <a className="btn btn-ghost" href={`#/r/${slug}`}>{t("portal.new")}</a>
      </div>
    </Card>
  );
}
