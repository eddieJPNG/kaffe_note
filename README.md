# kaffe_note

Minimalist notepad web app featuring persistent local storage.

Tela preta, texto branco, sem chrome. Abra e escreva — o texto sobrevive a
fechar a aba, fechar o navegador e desligar a máquina. Funciona offline após
a primeira visita. Sem backend, sem login, sem sincronização remota.

## Stack

- **Next.js (App Router) + React + TypeScript estrito**
- **IndexedDB** (Dexie) para o conteúdo do texto
- **localStorage** para preferências (tamanho de fonte) e espelho síncrono de segurança
- **Service Worker + Cache API** para modo offline (PWA instalável)
- **CSS puro**, sem bibliotecas visuais

## Desenvolvimento

```bash
npm install
npm run dev        # desenvolvimento em http://localhost:3000
```

## Build e preview do export estático

```bash
npm run build      # gera o site estático em ./out
npm run preview    # serve ./out em http://localhost:4173
```

Outros scripts:

```bash
npm run typecheck  # TypeScript estrito sem emitir
```

## Atalhos de teclado

| Atalho | Ação |
|--------|------|
| `Ctrl/Cmd + "+"` | Aumentar fonte |
| `Ctrl/Cmd + "-"` | Diminuir fonte |
| `Ctrl/Cmd + 0` | Restaurar fonte padrão (16px) |
| `Ctrl/Cmd + S` | Forçar salvamento com feedback |
| `Ctrl/Cmd + Shift + Delete` | Limpar todo o conteúdo (com confirmação) |

## Deploy

O build é 100% estático (`output: export`, saída em `./out`). Funciona em
qualquer host estático:

- **Vercel / Netlify:** detectam o Next.js automaticamente; build `npm run build`,
  publicação do diretório `out`
- **nginx / GitHub Pages / qualquer CDN:** copie o conteúdo de `out/`

> **Service Worker:** ao fazer deploy de mudanças no shell ou na estratégia de
> cache, incremente `CACHE_VERSION` em `public/sw.js` para invalidar os caches
> antigos.

## Estrutura

```
src/
  app/
    layout.tsx          # HTML raiz, metadados, manifesto PWA
    page.tsx            # compõe Notepad + ServiceWorkerRegister
    globals.css         # reset, tela preta, estilos do editor
  components/
    Notepad.tsx         # estado, auto-save, atalhos, sync entre abas, alertas
    ServiceWorkerRegister.tsx
  lib/
    db.ts               # abstração Dexie (IndexedDB)
    prefs.ts            # preferências em localStorage
public/
  sw.js                 # Service Worker (versionamento de cache)
  manifest.webmanifest  # manifesto PWA
docs/
  SDD.md                # Documento de Design de Software
```

## Privacidade

Seu texto nunca sai do navegador. Não há backend, telemetria, cookies de
rastreamento ou fontes externas. Limpar os dados do site apaga a nota.

## Documentação

O [docs/SDD.md](docs/SDD.md) descreve a arquitetura, as decisões tomadas
durante o desenvolvimento, os critérios de aceite e o roadmap.
