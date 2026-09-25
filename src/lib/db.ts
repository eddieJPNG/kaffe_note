/**
 * Camada de abstração do IndexedDB via Dexie.
 * Conteúdo do notepad vive aqui (persistência duradoura).
 * Instância criada de forma preguiçosa (lazy) para nunca tocar em
 * indexedDB durante a renderização no servidor (SSR/prerender).
 */
import Dexie, { type Table } from "dexie";

export interface NoteRecord {
  /** Documento único do app. */
  id: string;
  /** Texto integral da nota. */
  text: string;
  /** Epoch ms da última gravação bem-sucedida. */
  updatedAt: number;
}

const DB_NAME = "kaffe-note";
const DB_VERSION = 1;
const NOTE_ID = "default";

let instance: Dexie | null = null;

function db(): Dexie {
  if (instance === null) {
    const d = new Dexie(DB_NAME);
    // notes: chave primária "id", índice secundário "updatedAt".
    d.version(DB_VERSION).stores({ notes: "id, updatedAt" });
    instance = d;
  }
  return instance;
}

function notes(): Table<NoteRecord> {
  return db().table<NoteRecord>("notes");
}

/** Lê o documento único. Retorna undefined se nunca houve gravação. */
export async function loadNote(): Promise<NoteRecord | undefined> {
  return notes().get(NOTE_ID);
}

/**
 * Gravação completa (overwrite) — semântica "última gravação vence".
 * `updatedAt` é injetado pelo chamador para que o espelho (localStorage)
 * carregue exatamente o mesmo timestamp do IndexedDB; sem isso, a
 * hidratação via espelho pareceria sempre "mais nova" e marcava a nota
 * como pendente, fazendo abas ignorarem atualizações.
 */
export async function saveNote(text: string, updatedAt: number): Promise<void> {
  await notes().put({ id: NOTE_ID, text, updatedAt });
}

/** Remove o documento (usado pelo Ctrl+Shift+Delete). */
export async function clearNote(): Promise<void> {
  await notes().delete(NOTE_ID);
}

/** Detecta "quota excedida" para acionar o alerta da Sprint 5. */
export function isQuotaError(err: unknown): boolean {
  return (
    err instanceof DOMException &&
    (err.name === "QuotaExceededError" || err.code === 22)
  );
}
