"use client";

import { useEffect } from "react";

/**
 * Registra o Service Worker (Sprint 4).
 * Apenas em produção: em desenvolvimento o SW causaria cache confuso
 * durante o hot reload.
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      void navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch(() => {
          // Falha silenciosa: o app funciona apenas sem modo offline.
        });
    };

    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
