"use client";

import { useEffect } from "react";

/** Intervalo mínimo entre checagens de atualização do SW no foco da aba. */
const UPDATE_THROTTLE_MS = 60_000;

/**
 * Registra o Service Worker (Sprint 4).
 * Apenas em desenvolvimento o SW causaria cache confuso durante o hot reload,
 * por isso só registra em produção.
 *
 * Segurança (S3 da auditoria):
 * - `updateViaCache: "none"`: o navegador sempre busca o sw.js novo da rede,
 *   nunca de um cache HTTP (KAF-09).
 * - Ao voltar o foco da aba, dispara `registration.update()` (com throttle)
 *   para não esperar a próxima navegação para pegar uma correção.
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      void navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .catch(() => {
          // Falha silenciosa: o app funciona apenas sem modo offline.
        });
    };

    let lastCheck = 0;
    const checkForUpdate = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastCheck < UPDATE_THROTTLE_MS) return;
      lastCheck = now;
      void navigator.serviceWorker
        .getRegistration()
        .then((reg) => reg?.update())
        .catch(() => undefined);
    };
    document.addEventListener("visibilitychange", checkForUpdate);

    let waitingForLoad = false;
    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
      waitingForLoad = true;
    }

    return () => {
      document.removeEventListener("visibilitychange", checkForUpdate);
      if (waitingForLoad) window.removeEventListener("load", register);
    };
  }, []);

  return null;
}
