"use client";

/**
 * Notepad — única interface do app.
 * Tela preta, texto branco, sem chrome. Este componente concentra:
 * estado do texto, auto-save com debounce, hidratação no mount,
 * atalhos de teclado, sincronização entre abas e alertas de cota.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { clearNote, isQuotaError, loadNote, saveNote } from "@/lib/db";
import {
  DEFAULT_FONT_SIZE,
  FONT_STEP,
  clampFontSize,
  loadPrefs,
  savePrefs,
} from "@/lib/prefs";

/** Espera após a última tecla antes de gravar (Sprint 1). */
const DEBOUNCE_MS = 750;
/** Salvamento periódico de segurança enquanto houver alteração pendente. */
const PERIODIC_MS = 5_000;
/** Duração do feedback sutil "salvo" no canto inferior direito. */
const NOTICE_MS = 1_500;
/** Espelho síncrono de última gravação (localStorage) — rede de segurança. */
const MIRROR_KEY = "kaffe.mirror.v1";
/** Canal de sincronização entre abas (BroadcastChannel). */
const CHANNEL_NAME = "kaffe-note";

interface MirrorEntry {
  text: string;
  updatedAt: number;
}

type TabMessage =
  | { type: "saved"; text: string; updatedAt: number; sender: string }
  | { type: "cleared"; sender: string };

function readMirror(): MirrorEntry | null {
  try {
    const raw = window.localStorage.getItem(MIRROR_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "text" in parsed &&
      "updatedAt" in parsed &&
      typeof (parsed as MirrorEntry).text === "string" &&
      typeof (parsed as MirrorEntry).updatedAt === "number"
    ) {
      return parsed as MirrorEntry;
    }
    return null;
  } catch {
    return null;
  }
}

function writeMirror(entry: MirrorEntry): void {
  try {
    window.localStorage.setItem(MIRROR_KEY, JSON.stringify(entry));
  } catch {
    // Espelho é best-effort; o IndexedDB continua sendo a fonte primária.
  }
}

function clearMirror(): void {
  try {
    window.localStorage.removeItem(MIRROR_KEY);
  } catch {
    // ignorado
  }
}

/** Gera um identificador curto de aba (para não ecoar as próprias mensagens). */
function makeTabId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function Notepad() {
  const [text, setText] = useState("");
  const [fontSize, setFontSize] = useState(DEFAULT_FONT_SIZE);
  const [hydrated, setHydrated] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  /** Espelho síncrono do texto para uso em listeners sem stale closure. */
  const textRef = useRef("");
  const dirtyRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noticeRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tabIdRef = useRef("");
  const channelRef = useRef<BroadcastChannel | null>(null);

  if (tabIdRef.current === "") {
    tabIdRef.current = makeTabId();
  }

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    if (noticeRef.current !== null) clearTimeout(noticeRef.current);
    noticeRef.current = setTimeout(() => setNotice(null), NOTICE_MS);
  }, []);

  /** Gravação imediata. `manual` exibe feedback visual (Ctrl+S). */
  const persist = useCallback(
    async (manual: boolean) => {
      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      const snapshot = textRef.current;
      const updatedAt = Date.now();
      try {
        await saveNote(snapshot, updatedAt);
        dirtyRef.current = false;
        writeMirror({ text: snapshot, updatedAt });
        setStorageError(null);
        channelRef.current?.postMessage({
          type: "saved",
          text: snapshot,
          updatedAt,
          sender: tabIdRef.current,
        } satisfies TabMessage);
        if (manual) showNotice("salvo");
      } catch (err) {
        if (isQuotaError(err)) {
          setStorageError(
            "Armazenamento do navegador cheio: o texto não pôde ser salvo. Libere espaço (apague dados do site) ou copie seu conteúdo.",
          );
        } else {
          setStorageError(
            "Falha ao salvar no armazenamento local. Suas alterações mais recentes podem não estar persistidas.",
          );
        }
      }
    },
    [showNotice],
  );

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = event.target.value;
      textRef.current = value;
      setText(value);
      dirtyRef.current = true;
      if (debounceRef.current !== null) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        void persist(false);
      }, DEBOUNCE_MS);
    },
    [persist],
  );

  const changeFontSize = useCallback(
    (delta: number) => {
      setFontSize((current) => {
        const next = clampFontSize(current + delta);
        savePrefs({ fontSize: next });
        return next;
      });
    },
    [],
  );

  const resetFontSize = useCallback(() => {
    setFontSize(DEFAULT_FONT_SIZE);
    savePrefs({ fontSize: DEFAULT_FONT_SIZE });
  }, []);

  const clearAll = useCallback(async () => {
    const confirmed = window.confirm(
      "Apagar todo o conteúdo da nota? Esta ação não pode ser desfeita.",
    );
    if (!confirmed) return;
    if (debounceRef.current !== null) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    try {
      await clearNote();
      clearMirror();
      dirtyRef.current = false;
      textRef.current = "";
      setText("");
      setStorageError(null);
      channelRef.current?.postMessage({
        type: "cleared",
        sender: tabIdRef.current,
      } satisfies TabMessage);
      showNotice("limpo");
      textareaRef.current?.focus();
    } catch {
      setStorageError("Falha ao limpar o armazenamento local.");
    }
  }, [showNotice]);

  /** Hidratação inicial: espelho síncrono primeiro, IndexedDB resolve o resto. */
  useEffect(() => {
    const prefs = loadPrefs();
    setFontSize(prefs.fontSize);

    const mirror = readMirror();
    if (mirror !== null) {
      textRef.current = mirror.text;
      setText(mirror.text);
    }

    let cancelled = false;
    (async () => {
      try {
        const record = await loadNote();
        if (cancelled) return;
        const mirrorEntry = readMirror();

        // O usuário digitou antes do carregamento concluir: preserva o que
        // ele digitou (dirty já está true) e deixa o flush gravar por cima.
        if (!dirtyRef.current) {
          // Fonte vencedora: a gravação mais recente entre IndexedDB e espelho.
          const fromRecord =
            record !== undefined &&
            (mirrorEntry === null || record.updatedAt >= mirrorEntry.updatedAt);
          const winner = fromRecord
            ? record
            : mirrorEntry !== null
              ? { text: mirrorEntry.text, updatedAt: mirrorEntry.updatedAt }
              : undefined;

          if (winner !== undefined) {
            textRef.current = winner.text;
            setText(winner.text);
          }
          // Espelho mais novo que o IndexedDB (ou espelho sem registro no
          // IndexedDB): gravação pendente pós-crash; marca como pendente
          // para regravar o IndexedDB no próximo ciclo.
          if (
            (record === undefined && mirrorEntry !== null) ||
            (record !== undefined &&
              mirrorEntry !== null &&
              mirrorEntry.updatedAt > record.updatedAt)
          ) {
            dirtyRef.current = true;
          }
        }
      } catch {
        if (!cancelled) {
          setStorageError(
            "Não foi possível abrir o armazenamento local. O texto digitado pode não persistir.",
          );
        }
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /** Foco automático: o cursor deve estar na área de texto ao abrir. */
  useEffect(() => {
    if (!hydrated) return;
    const el = textareaRef.current;
    if (el === null) return;
    el.focus();
    const end = el.value.length;
    el.setSelectionRange(end, end);
  }, [hydrated]);

  /** Atalhos de teclado (Sprint 3). */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey;
      if (!mod) return;

      const key = event.key;

      // Ctrl + Shift + Delete → limpar conteúdo com confirmação.
      if (event.shiftKey && (key === "Delete" || key === "Backspace")) {
        event.preventDefault();
        void clearAll();
        return;
      }
      if (event.shiftKey) return;

      // Ctrl + "+" / "=" → aumentar fonte (previne zoom do navegador).
      if (key === "+" || key === "=" || event.code === "NumpadAdd") {
        event.preventDefault();
        changeFontSize(FONT_STEP);
        return;
      }
      // Ctrl + "-" → diminuir fonte.
      if (key === "-" || event.code === "NumpadSubtract") {
        event.preventDefault();
        changeFontSize(-FONT_STEP);
        return;
      }
      // Ctrl + 0 → restaurar fonte padrão.
      if (key === "0") {
        event.preventDefault();
        resetFontSize();
        return;
      }
      // Ctrl + S → salvamento imediato com feedback.
      if (key === "s" || key === "S") {
        event.preventDefault();
        void persist(true);
        return;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [changeFontSize, resetFontSize, persist, clearAll]);

  /**
   * Ciclo de vida do navegador (Sprint 2):
   * - pagehide: gravação imediata (fire-and-forget) + espelho síncrono.
   * - visibilitychange (hidden): gravação imediata ao trocar de aba/app.
   * - beforeunload: apenas espelho síncrono (IDB assíncrono não garantido).
   * - intervalo periódico: segurança contra perda em situações anormais.
   */
  useEffect(() => {
    const onPageHide = () => {
      if (dirtyRef.current) {
        writeMirror({ text: textRef.current, updatedAt: Date.now() });
        void persist(false);
      }
    };
    const onBeforeUnload = () => {
      // Só há o que proteger se existir alteração pendente; sem dirty,
      // espelho e IndexedDB já estão em sincronia.
      if (dirtyRef.current) {
        writeMirror({ text: textRef.current, updatedAt: Date.now() });
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden" && dirtyRef.current) {
        writeMirror({ text: textRef.current, updatedAt: Date.now() });
        void persist(false);
      }
    };

    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("visibilitychange", onVisibility);
    const interval = setInterval(() => {
      if (dirtyRef.current) void persist(false);
    }, PERIODIC_MS);

    return () => {
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("visibilitychange", onVisibility);
      clearInterval(interval);
      if (debounceRef.current !== null) clearTimeout(debounceRef.current);
      if (noticeRef.current !== null) clearTimeout(noticeRef.current);
    };
  }, [persist]);

  /**
   * Sincronização entre abas (Sprint 5): última gravação vence.
   * Uma aba que recebe atualização de outra só a adota se não tiver
   * alterações pendentes; caso contrário, sua próxima gravação sobrescreve.
   */
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channelRef.current = channel;
    channel.onmessage = (event: MessageEvent<TabMessage>) => {
      const message = event.data;
      if (!message || message.sender === tabIdRef.current) return;
      if (message.type === "saved") {
        if (!dirtyRef.current) {
          textRef.current = message.text;
          setText(message.text);
        }
      } else if (message.type === "cleared") {
        if (!dirtyRef.current) {
          textRef.current = "";
          setText("");
        }
      }
    };
    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, []);

  /**
   * Solicita armazenamento persistente (S2 da auditoria — KAF-05): sem
   * persist(), o navegador pode evacuar o IndexedDB sob pressão de espaço,
   * violando a promessa de durabilidade do app. Melhor esforço: navegadores
   * podem negar (ex.: perfil novo) — não é erro.
   */
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.storage?.persist) return;
    let cancelled = false;
    (async () => {
      try {
        const already = navigator.storage.persisted
          ? await navigator.storage.persisted()
          : false;
        if (!cancelled && !already) {
          await navigator.storage.persist();
        }
      } catch {
        // Negação/falha é silenciosa (sem log de conteúdo).
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Alerta proativo de proximidade da cota (Sprint 5). */
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.storage?.estimate) return;
    let cancelled = false;
    (async () => {
      try {
        const est = await navigator.storage.estimate();
        if (cancelled) return;
        if (
          typeof est.quota === "number" &&
          typeof est.usage === "number" &&
          est.quota > 0 &&
          est.usage / est.quota > 0.95
        ) {
          setStorageError(
            `Armazenamento do navegador quase cheio (${Math.round((est.usage / est.quota) * 100)}%). Libere espaço para evitar perda de texto.`,
          );
        }
      } catch {
        // estimate() é opcional; falha silenciosa.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="note-shell">
      <textarea
        ref={textareaRef}
        className="note-editor"
        value={text}
        onChange={handleChange}
        style={{ fontSize: `${fontSize}px` }}
        aria-label="Área de escrita do notepad"
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        placeholder=""
      />
      <div
        className={`note-notice${notice !== null ? " is-visible" : ""}`}
        aria-live="polite"
      >
        {notice ?? ""}
      </div>
      {storageError !== null && (
        <div className="note-alert" role="alert">
          {storageError}
        </div>
      )}
    </main>
  );
}
