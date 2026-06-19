import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type Lang = "en" | "ar";

const DICT: Record<Lang, Record<string, string>> = {
  en: {
    "nav.overview": "Overview", "nav.inbox": "Returns", "nav.rules": "Rules", "nav.analytics": "Analytics", "nav.plan": "Plan", "nav.settings": "Settings",
    "common.loading": "Loading…", "common.save": "Save", "common.cancel": "Cancel", "common.back": "Back", "common.next": "Next", "common.submit": "Submit", "common.search": "Search", "common.all": "All", "common.none": "None", "common.retry": "Retry",
    "status.requested": "Requested", "status.approved": "Approved", "status.in_transit": "In transit", "status.received": "Received", "status.resolved": "Resolved", "status.rejected": "Rejected", "status.cancelled": "Cancelled",
    "kpi.awaiting": "Awaiting action", "kpi.in_transit": "In transit", "kpi.resolved": "Resolved (recent)", "kpi.automation": "Automation", "kpi.avg_resolution": "Avg resolution", "kpi.this_month": "This month", "kpi.exchanges": "Exchanges", "kpi.credit": "Store credit", "kpi.refunded": "Cash refunded", "kpi.hours": "hrs",
    "inbox.title": "Returns", "inbox.empty": "No returns yet", "inbox.col.rma": "RMA", "inbox.col.order": "Order", "inbox.col.resolution": "Resolution", "inbox.col.status": "Status", "inbox.col.value": "Value", "inbox.col.date": "Date",
    "detail.items": "Items", "detail.timeline": "Timeline", "detail.attachments": "Attachments", "detail.approve": "Approve", "detail.reject": "Reject", "detail.receive": "Mark received", "detail.resolve": "Resolve", "detail.reason": "Reason", "detail.customer": "Customer",
    "resolve.title": "Resolve return", "resolve.refund": "Refund", "resolve.exchange": "Exchange", "resolve.store_credit": "Store credit", "resolve.reference": "Reference (if done in Salla)", "resolve.execute": "Execute",
    "rules.title": "Return policy", "rules.window": "Return window (days)", "rules.auto": "Auto-approve", "rules.auto_max": "Auto-approve max value (SAR)", "rules.refund": "Allow refund", "rules.exchange": "Allow exchange", "rules.credit": "Allow store credit", "rules.saved": "Policy saved",
    "portal.start.title": "Track or start a return", "portal.start.order": "Order number", "portal.start.email": "Email on the order", "portal.start.send": "Send code", "portal.verify.title": "Enter your code", "portal.verify.hint": "We sent a 6-digit code to your email.", "portal.verify.verify": "Verify",
    "portal.items.title": "What are you returning?", "portal.items.reason": "Reason", "portal.res.title": "How would you like it resolved?", "portal.success.title": "Request submitted", "portal.success.sub": "We'll email you updates.", "portal.track": "Track my returns", "portal.new": "Start a return",
    "reason.defective": "Defective", "reason.wrong_item": "Wrong item", "reason.not_as_described": "Not as described", "reason.changed_mind": "Changed mind", "reason.size_issue": "Size issue", "reason.other": "Other",
  },
  ar: {
    "nav.overview": "نظرة عامة", "nav.inbox": "المرتجعات", "nav.rules": "القواعد", "nav.analytics": "التحليلات", "nav.plan": "الباقة", "nav.settings": "الإعدادات",
    "common.loading": "جارٍ التحميل…", "common.save": "حفظ", "common.cancel": "إلغاء", "common.back": "رجوع", "common.next": "التالي", "common.submit": "إرسال", "common.search": "بحث", "common.all": "الكل", "common.none": "لا شيء", "common.retry": "إعادة",
    "status.requested": "مطلوب", "status.approved": "موافَق عليه", "status.in_transit": "قيد الشحن", "status.received": "مستلَم", "status.resolved": "تمت المعالجة", "status.rejected": "مرفوض", "status.cancelled": "ملغى",
    "kpi.awaiting": "بانتظار إجراء", "kpi.in_transit": "قيد الشحن", "kpi.resolved": "تمت المعالجة (حديثًا)", "kpi.automation": "الأتمتة", "kpi.avg_resolution": "متوسط المعالجة", "kpi.this_month": "هذا الشهر", "kpi.exchanges": "الاستبدالات", "kpi.credit": "رصيد المتجر", "kpi.refunded": "المبالغ المستردة", "kpi.hours": "ساعة",
    "inbox.title": "المرتجعات", "inbox.empty": "لا توجد مرتجعات بعد", "inbox.col.rma": "رقم الطلب", "inbox.col.order": "الطلب", "inbox.col.resolution": "الحل", "inbox.col.status": "الحالة", "inbox.col.value": "القيمة", "inbox.col.date": "التاريخ",
    "detail.items": "العناصر", "detail.timeline": "السجل الزمني", "detail.attachments": "المرفقات", "detail.approve": "موافقة", "detail.reject": "رفض", "detail.receive": "تم الاستلام", "detail.resolve": "معالجة", "detail.reason": "السبب", "detail.customer": "العميل",
    "resolve.title": "معالجة الإرجاع", "resolve.refund": "استرداد", "resolve.exchange": "استبدال", "resolve.store_credit": "رصيد المتجر", "resolve.reference": "المرجع (إن تم في سلة)", "resolve.execute": "تنفيذ",
    "rules.title": "سياسة الإرجاع", "rules.window": "مدة الإرجاع (أيام)", "rules.auto": "موافقة تلقائية", "rules.auto_max": "حد الموافقة التلقائية (ريال)", "rules.refund": "السماح بالاسترداد", "rules.exchange": "السماح بالاستبدال", "rules.credit": "السماح برصيد المتجر", "rules.saved": "تم حفظ السياسة",
    "portal.start.title": "تتبّع أو ابدأ إرجاعًا", "portal.start.order": "رقم الطلب", "portal.start.email": "البريد المرتبط بالطلب", "portal.start.send": "إرسال الرمز", "portal.verify.title": "أدخل الرمز", "portal.verify.hint": "أرسلنا رمزًا من 6 أرقام إلى بريدك.", "portal.verify.verify": "تحقق",
    "portal.items.title": "ما الذي تريد إرجاعه؟", "portal.items.reason": "السبب", "portal.res.title": "كيف تريد المعالجة؟", "portal.success.title": "تم إرسال الطلب", "portal.success.sub": "سنرسل لك التحديثات عبر البريد.", "portal.track": "تتبّع مرتجعاتي", "portal.new": "ابدأ إرجاعًا",
    "reason.defective": "معيب", "reason.wrong_item": "منتج خاطئ", "reason.not_as_described": "مخالف للوصف", "reason.changed_mind": "غيّرت رأيي", "reason.size_issue": "مشكلة مقاس", "reason.other": "أخرى",
  },
};

type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (k: string) => string; dir: "ltr" | "rtl" };
const LangCtx = createContext<Ctx>({ lang: "en", setLang: () => {}, t: (k) => k, dir: "ltr" });

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    try {
      return (localStorage.getItem("rx_lang") as Lang) || (navigator.language?.startsWith("ar") ? "ar" : "en");
    } catch {
      return "en";
    }
  });
  const dir: "ltr" | "rtl" = lang === "ar" ? "rtl" : "ltr";
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
  }, [lang, dir]);
  const setLang = useCallback((l: Lang) => {
    try {
      localStorage.setItem("rx_lang", l);
    } catch {
      /* ignore */
    }
    setLangState(l);
  }, []);
  const t = useCallback((k: string) => DICT[lang][k] ?? DICT.en[k] ?? k, [lang]);
  const value = useMemo(() => ({ lang, setLang, t, dir }), [lang, setLang, t, dir]);
  return <LangCtx.Provider value={value}>{children}</LangCtx.Provider>;
}

export const useI18n = () => useContext(LangCtx);
