/**
 * Preferências do usuário (tamanho de fonte) em localStorage.
 * localStorage é síncrono: leitura imediata, sem piscar o layout
 * depois da hidratação. Conteúdo do texto NÃO passa por aqui.
 */

const PREFS_KEY = "kaffe.prefs.v1";

export const DEFAULT_FONT_SIZE = 16;
export const MIN_FONT_SIZE = 10;
export const MAX_FONT_SIZE = 48;
/** Passo do Ctrl+"+" / Ctrl+"-" (em pixels de fonte). */
export const FONT_STEP = 1;

export interface Prefs {
  fontSize: number;
}

export function clampFontSize(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_FONT_SIZE;
  return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(value)));
}

/** Nunca lança: localStorage pode estar bloqueado (modo privado, cota). */
export function loadPrefs(): Prefs {
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return { fontSize: DEFAULT_FONT_SIZE };
    const parsed: unknown = JSON.parse(raw);
    const fontSize =
      typeof parsed === "object" &&
      parsed !== null &&
      "fontSize" in parsed &&
      typeof (parsed as { fontSize: unknown }).fontSize === "number"
        ? clampFontSize((parsed as { fontSize: number }).fontSize)
        : DEFAULT_FONT_SIZE;
    return { fontSize };
  } catch {
    return { fontSize: DEFAULT_FONT_SIZE };
  }
}

export function savePrefs(prefs: Prefs): void {
  try {
    window.localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({ fontSize: clampFontSize(prefs.fontSize) }),
    );
  } catch {
    // Preferência é best-effort: falha não afeta o conteúdo.
  }
}
