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
npm run typecheck        # TypeScript estrito sem emitir
npm run verify:headers   # gate de segurança: headers do vercel.json + CSP
```

## Atalhos de teclado

| Atalho | Ação |
|--------|------|
| `Ctrl/Cmd + "+"` | Aumentar fonte |
| `Ctrl/Cmd + "-"` | Diminuir fonte |
| `Ctrl/Cmd + 0` | Restaurar fonte padrão (16px) |
| `Ctrl/Cmd + S` | Forçar salvamento com feedback |
| `Ctrl/Cmd + Shift + Delete` | Limpar todo o conteúdo (com confirmação) |

## Deploy (Vercel)

O build é 100% estático (`output: export`, saída em `./out`). A plataforma
oficial é a **Vercel**: o `vercel.json` na raiz já define o build
(`npm run build`), o diretório de saída (`out/`) e os cabeçalhos de segurança
(CSP, anti-framing, `nosniff`, HSTS). Publicar = importar o repositório na
Vercel (site ou CLI `vercel`) — nenhuma configuração extra.

O HTTPS é automático e obrigatório em todo domínio (inclusive os previews de
PR), o que habilita o HSTS.

> **Service Worker:** ao fazer deploy de mudanças no shell ou na estratégia de
> cache, incremente `CACHE_VERSION` em `public/sw.js` para invalidar os caches
> antigos.

> **Outros hosts:** copiar o conteúdo de `out/` continua funcionando em
> qualquer host estático, mas os cabeçalhos definidos no `vercel.json`
> precisam ser recriados na configuração do host escolhido. **GitHub Pages não
> é compatível** com o app em produção: não permite cabeçalhos customizados,
> o que eliminaria a CSP e a proteção contra framing.

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

## Segurança

Implementada conforme a [auditoria](docs/SECURITY_AUDIT.md) (sprints S0–S4):

- **CSP estrita com hashes sha256** — injetada no build por
  `scripts/inject-csp.mjs` (sem `'unsafe-inline'` em `script-src`);
  `frame-ancestors 'none'` vem do header do `vercel.json`
- **Cabeçalhos:** `X-Frame-Options: DENY`, `nosniff`,
  `Referrer-Policy: no-referrer`, `Permissions-Policy` negando recursos não
  usados, HSTS
- **Supply chain:** actions fixadas por SHA, `npm audit` como gate de CI,
  Dependabot semanal
- **Durabilidade:** `navigator.storage.persist()` para impedir evacuação do
  IndexedDB pelo navegador
- **Zero terceiros:** nenhuma CDN, fonte ou script externo — por isso não há
  SRI a aplicar; se algum recurso externo for adicionado no futuro, exigir
  `integrity` + `crossorigin` (ou continuar baixando tudo em build)
- Gate de CI (`npm run verify:headers`) impede regressão dos headers/CSP

## Privacidade

Seu texto nunca sai do navegador. Não há backend, telemetria, cookies de
rastreamento ou fontes externas. Limpar os dados do site apaga a nota.
O conteúdo fica **em claro** no armazenamento do navegador (decisão
documentada no SDD §7): cifrar com chave guardada no mesmo perfil teria
valor limitado para um app 100% local.

## Licenças de dependências

O projeto é MIT ([LICENSE](LICENSE)). Entre as dependências de build:
`caniuse-lite` (CC-BY-4.0 — atribuição) e binários `sharp`/libvips
(LGPL-3.0, opcionais do Next.js para otimização de imagens — não
distribuídos no artefato estático gerado em `out/`). Nenhuma obrigação de
licença se aplica ao site publicado.

## Documentação

- [docs/SDD.md](docs/SDD.md) — arquitetura, decisões, critérios de aceite e roadmap
- [docs/SECURITY_AUDIT.md](docs/SECURITY_AUDIT.md) — auditoria de segurança,
  achados, correções (S0–S4) e verificação
