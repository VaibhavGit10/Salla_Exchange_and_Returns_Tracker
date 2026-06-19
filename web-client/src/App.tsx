import React from "react";
import { I18nProvider } from "./i18n";
import { ToastProvider } from "./components/ui";
import { AppRouter } from "./app/router";

export function App() {
  return (
    <I18nProvider>
      <ToastProvider>
        <AppRouter />
      </ToastProvider>
    </I18nProvider>
  );
}
