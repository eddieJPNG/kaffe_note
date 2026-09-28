# Kaffe Note

[![CI](https://github.com/eddieJPNG/kaffe_note/actions/workflows/ci.yml/badge.svg)](https://github.com/eddieJPNG/kaffe_note/actions/workflows/ci.yml)
[![Licença: MIT](https://img.shields.io/badge/licença-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20.9.0-green.svg)](package.json)

Notepad minimalista 100% client-side com persistência local duradoura.

Tela preta, texto branco, sem chrome: abra e escreva. O texto sobrevive a
fechar a aba, fechar o navegador e desligar a máquina — tudo gravado no
próprio navegador (IndexedDB + espelho em `localStorage`). Funciona offline
após a primeira visita, é instalável como PWA e não exige backend, login ou
sincronização remota.

## Descrição

O Kaffe Note é uma aplicação web estática (`output: export` do Next.js) cuja
única interface é uma `<textarea>` em tela cheia. Todo o ciclo de vida do
conteúdo é resolvido no navegador:

- **Gravação em camadas** — debounce de 750 ms após a última tecla, flush
  imediato em `pagehide`/`visibilitychange`, flush periódico de segurança a
  cada 5 s e espelho síncrono em `localStorage` para cobrir o caminho em que o
  IndexedDB (assíncrono) não chega a ser gravado (ex.: fechamento abrupto).
- **Fonte vencedora** — na hidratação, o registro mais recente entre IndexedDB
  e o espelho é adotado; uma gravação pendente pós-crash é regravada.
- **Sincronização entre abas** — `BroadcastChannel` com semântica de última
  gravação vence; mensagens cross-tab são validadas em runtime antes de tocar
  no estado.
- **Sem rede** — nenhum script, fonte ou CDN de terceiros; a CSP resultante é
  `default-src 'none'` com hashes `sha256` por build.

Não há API HTTP, servidor próprio nem telemetria: o artefato publicado é o
diretório `out/`.

## Recursos

- Persistência duradoura em **IndexedDB** (Dexie) com auto-save em múltiplas
  camadas (debounce, eventos de ciclo de vida, intervalo periódico).
- **Espelho síncrono** em `localStorage` como rede de segurança contra perda
  de texto e como fonte na recuperação pós-crash.
- **Sincronização entre abas** via `BroadcastChannel` (última gravação vence),
  com descarte de mensagens malformadas.
- **Modo offline / PWA instalável** — Service Worker com três estratégias
  (network-first para navegação, cache-first para assets estáticos,
  stale-while-revalidate para o restante) e versionamento de cache por
  `CACHE_VERSION`.
- **Preferências locais** — tamanho de fonte de 10px a 48px (padrão 16px),
  persistido em `localStorage`.
- **Atalhos de teclado** — zoom de fonte, salvamento forçado e limpeza total
  com confirmação.
- **Feedback discreto** — aviso transitório de "salvo"/"limpo" e alertas
  proativos de cota de armazenamento (`navigator.storage.estimate()`).
- **Durabilidade solicitada ao navegador** — `navigator.storage.persist()` para
  reduzir o risco de evacuação do IndexedDB.
- **Segurança por build** — CSP com hashes injetada pós-build, cabeçalhos de
  segurança no `vercel.json` e gate de verificação automatizado.
- **Zero backend, zero cookies, zero terceiros** — o conteúdo nunca sai do
  dispositivo.

## Stack Tecnológica

| Camada | Tecnologia |
|--------|------------|
| Framework | Next.js 16 (App Router, `output: export`) |
| UI | React 19 |
| Linguagem | TypeScript 5.9 (`strict` + `noUncheckedIndexedAccess`) |
| Persistência | IndexedDB via [Dexie](https://dexie.org) 4; `localStorage` |
| Offline / PWA | Service Worker + Cache API, `manifest.webmanifest` |
| Estilo | CSS puro (`src/app/globals.css`), sem bibliotecas visuais |
| Build / pós-build | Node 20.9+ (scripts ESM em `scripts/*.mjs`) |
| Deploy | Vercel (estático), configuração em `vercel.json` |
| CI | GitHub Actions + Dependabot (actions fixadas por SHA) |

## Estrutura do Projeto

```
├── src/
│   ├── app/
│   │   ├── layout.tsx            # HTML raiz, metadados, lang=pt-BR, manifesto PWA
│   │   ├── page.tsx              # compõe Notepad + ServiceWorkerRegister
│   │   └── globals.css           # reset, tema preto, estilos do editor
│   ├── components/
│   │   ├── Notepad.tsx           # estado, auto-save, atalhos, sync entre abas, alertas
│   │   └── ServiceWorkerRegister.tsx  # registro do SW (apenas produção)
│   └── lib/
│       ├── db.ts                 # abstração Dexie (IndexedDB)
│       └── prefs.ts              # preferências em localStorage
├── public/
│   ├── sw.js                     # Service Worker (CACHE_VERSION e estratégias)
│   ├── manifest.webmanifest      # manifesto PWA (pt-BR, standalone)
│   └── icon.svg
├── scripts/
│   ├── inject-csp.mjs            # pós-build: injeta CSP com hashes em out/**/*.html
│   ├── preview.mjs               # servidor estático local com os headers do vercel.json
│   └── verify-headers.mjs        # gate de segurança (config ou URL de um deploy)
├── docs/
│   ├── SDD.md                    # Documento de Design de Software (arquitetura/roadmap)
│   └── SECURITY_AUDIT.md         # auditoria de segurança (achados KAF-01…09, sprints S0–S4)
├── .github/
│   ├── workflows/ci.yml          # audit + typecheck + build + security gate
│   └── dependabot.yml            # atualizações semanais (npm e github-actions)
├── assets/icon.png               # ícone de origem (o ícone servido é public/icon.svg)
├── next.config.ts                # output: export, images desotimizadas, trailingSlash
├── vercel.json                   # build, saída e cabeçalhos de segurança
└── package.json
```

`out/` (build estático), `.next/` e `node_modules/` são ignorados pelo Git.

## Instalação

**Pré-requisitos:** Node.js `>=20.9.0` (a CI usa Node 22) e npm.

```bash
git clone https://github.com/eddieJPNG/kaffe_note.git
cd kaffe_note
npm install
npm run dev
```

O app de desenvolvimento sobe em <http://localhost:3000>.

Para validar o artefato de produção localmente:

```bash
npm run build      # gera ./out e injeta a CSP
npm run preview    # serve ./out em http://127.0.0.1:4173 com os headers reais
npm run verify:headers
```

## Uso

Abra a página e escreva — não há botões, menus ou chrome. O cursor já é
posicionado na área de texto no carregamento e o conteúdo é gravado
automaticamente.

### Atalhos de teclado

| Atalho | Ação |
|--------|------|
| `Ctrl/Cmd + "+"` | Aumentar fonte (passo de 1px, máx. 48px) |
| `Ctrl/Cmd + "-"` | Diminuir fonte (mín. 10px) |
| `Ctrl/Cmd + 0` | Restaurar fonte padrão (16px) |
| `Ctrl/Cmd + S` | Forçar salvamento imediato com feedback "salvo" |
| `Ctrl/Cmd + Shift + Delete` | Limpar todo o conteúdo (com confirmação) |

### Comportamentos esperados

- Fechar a aba/navegador ou desligar a máquina não perde o texto salvo.
- Duas abas abertas mantêm o mesmo conteúdo (a última gravação vence).
- Após a primeira visita, o app abre mesmo sem conexão.
- Se a cota de armazenamento estiver >95%, um alerta exibe o percentual
  ocupado; um erro de `QuotaExceededError` também é reportado na tela.

## Configuração

Não há variáveis de ambiente obrigatórias nem arquivos `.env`: o app é 100%
estático e não consome serviços externos.

| Item | Onde | Padrão | Observação |
|------|------|--------|------------|
| `PORT` | variável de ambiente do `npm run preview` | `4173` | Porta do servidor de preview (bind em `127.0.0.1`) |
| `CACHE_VERSION` | `public/sw.js` | `v1` | Incrementar a cada deploy que altere o shell ou a estratégia de cache, para invalidar caches antigos |
| `buildCommand` / `outputDirectory` | `vercel.json` | `npm run build` / `out` | Já definidos — importar o repositório na Vercel basta |
| Cabeçalhos de segurança | `vercel.json` | CSP `frame-ancestors`, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS | Replicados no preview local e verificados por `verify:headers` |

Detalhes de deploy, limitações de outros hosts (inclusive a
incompatibilidade com GitHub Pages) e a estratégia de cache estão em
[`docs/SDD.md`](docs/SDD.md) §6–§7.

## Scripts

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Servidor de desenvolvimento do Next.js (`next dev`) |
| `npm run build` | `next build` + `node scripts/inject-csp.mjs` (gera `out/` com CSP) |
| `npm run preview` | Serve `out/` com os headers do `vercel.json` em `http://127.0.0.1:4173` |
| `npm run typecheck` | TypeScript estrito sem emitir (`tsc --noEmit`) |
| `npm run verify:headers` | Gate de segurança: valida `vercel.json` + CSP de `out/` |

`verify-headers.mjs` também aceita uma URL para auditar um deploy real:

```bash
node scripts/verify-headers.mjs https://seu-dominio.vercel.app
```

### CI (`.github/workflows/ci.yml`)

Executada em `push` para `main` e em `pull_request`:

1. `npm ci`
2. `npm audit --audit-level=high` (falha em CVE alto/crítico)
3. `npm run typecheck`
4. `npm run build`
5. `node scripts/verify-headers.mjs`
6. Upload de `out/` como artefato (7 dias)

## API

Não existe API HTTP. A superfície programática é a camada de persistência
usada pelos componentes:

### `src/lib/db.ts` — IndexedDB (Dexie)

Banco `kaffe-note` (v1), tabela `notes` (`id` primário, índice `updatedAt`),
documento único `default`.

| Exportação | Assinatura | Descrição |
|------------|------------|-----------|
| `NoteRecord` | `interface { id: string; text: string; updatedAt: number }` | Formato do registro da nota |
| `loadNote` | `(): Promise<NoteRecord \| undefined>` | Lê o documento único (`undefined` se nunca gravado) |
| `saveNote` | `(text: string, updatedAt: number) => Promise<void>` | Gravação completa (overwrite); `updatedAt` vem do chamador para casar com o espelho |
| `clearNote` | `(): Promise<void>` | Remove o documento (usado pelo `Ctrl+Shift+Delete`) |
| `isQuotaError` | `(err: unknown) => boolean` | Detecta `QuotaExceededError` para o alerta de cota |

A instância Dexie é criada de forma preguiçosa (lazy) para nunca tocar em
`indexedDB` durante SSR/prerender.

### `src/lib/prefs.ts` — preferências

| Exportação | Assinatura | Descrição |
|------------|------------|-----------|
| `DEFAULT_FONT_SIZE` / `MIN_FONT_SIZE` / `MAX_FONT_SIZE` / `FONT_STEP` | `16` / `10` / `48` / `1` | Limites do tamanho de fonte |
| `clampFontSize` | `(value: number) => number` | Valida e limita o valor |
| `loadPrefs` | `(): Prefs` | Lê `kaffe.prefs.v1`; nunca lança |
| `savePrefs` | `(prefs: Prefs) => void` | Grava `kaffe.prefs.v1`; best-effort |

### Chaves de armazenamento

| Chave | Meio | Conteúdo |
|-------|------|----------|
| `kaffe-note` (DB) / `notes` / `default` | IndexedDB | Texto integral + `updatedAt` |
| `kaffe.prefs.v1` | `localStorage` | Preferências (tamanho de fonte) |
| `kaffe.mirror.v1` | `localStorage` | Espelho síncrono da última gravação |
| `kaffe-note` | `BroadcastChannel` | Mensagens `saved`/`cleared` entre abas |
| `kaffe-note-<versão>` | Cache API | Precache do shell e assets |

## Segurança

Implementada conforme a [auditoria](docs/SECURITY_AUDIT.md) (sprints S0–S4):

- **CSP estrita com hashes `sha256`** injetada no build por
  `scripts/inject-csp.mjs` (sem `'unsafe-inline'` em `script-src`);
  `frame-ancestors 'none'` vem do header do `vercel.json`.
- **Cabeçalhos:** `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: no-referrer`, `Permissions-Policy` negando recursos não
  usados e HSTS (1 ano, `includeSubDomains`).
- **Supply chain:** actions fixadas por SHA completo, `npm audit` como gate de
  CI, Dependabot semanal para npm e GitHub Actions.
- **Durabilidade:** `navigator.storage.persist()` e validação em runtime das
  mensagens cross-tab.
- **Zero terceiros:** nenhuma CDN, fonte ou script externo — por isso não há
  SRI a aplicar; recursos externos futuros exigiriam `integrity` +
  `crossorigin`.
- **Gate de CI** (`verify:headers`) impede regressão de headers/CSP.

## Privacidade

Seu texto nunca sai do navegador: sem backend, sem telemetria, sem cookies de
rastreamento e sem requisições a terceiros. Limpar os dados do site apaga a
nota. O conteúdo fica **em claro** no armazenamento do navegador — decisão
documentada no [`docs/SDD.md`](docs/SDD.md) §7 (cifrar com chave guardada no
mesmo perfil teria valor limitado para um app 100% local).

## Contributing

Contribuições são bem-vindas.

1. Faça um `fork` e crie uma branch de tema (`feat/...`, `fix/...`, `docs/...`).
2. Mantenha o padrão existente: TypeScript estrito, comentários em
   português explicando o *porquê*, CSS puro e zero dependências novas sem
   justificativa.
3. Antes de abrir o PR, rode localmente a mesma sequência da CI:

   ```bash
   npm run typecheck
   npm run build
   npm run verify:headers
   ```

4. Se alterar segurança, headers ou CSP, atualize
   `docs/SECURITY_AUDIT.md`; se alterar arquitetura, atualize `docs/SDD.md`.
5. Descreva o problema e a solução no PR; mudanças no Service Worker devem
   incrementar `CACHE_VERSION`.

Não há rodada de lint/formatador configurada no repositório — segue o estilo
do arquivo que você estiver editando.

### Melhorias sugeridas

Pontos que ainda valem atenção em um projeto em produção:

- **Testes automatizados** — a lógica de hidratação/última gravação vence e o
  `inject-csp.mjs` são candidatos naturais a testes unitários; hoje a
  verificação é a do gate de CI (`verify-headers`) e os testes manuais de
  [`docs/SDD.md`](docs/SDD.md) §8.
- **Linter/formatter** — ESLint (com as regras do Next) e Prettier não estão
  presentes no `package.json`.
- **Ícone em `assets/`** — `assets/icon.png` não é referenciado pelo build
  (o manifesto usa `public/icon.svg`); pode ser movido para `public/` ou
  removido.

## Licença

Distribuído sob a licença **MIT** — veja [LICENSE](LICENSE).

Entre as dependências de build: `caniuse-lite` (CC-BY-4.0 — atribuição) e os
binários `sharp`/libvips (LGPL-3.0, opcionais do Next.js para otimização de
imagens, não distribuídos no artefato estático gerado em `out/`). Nenhuma
obrigação de licença se aplica ao site publicado.

## Documentação

- [`docs/SDD.md`](docs/SDD.md) — arquitetura, decisões, critérios de aceite e
  roadmap.
- [`docs/SECURITY_AUDIT.md`](docs/SECURITY_AUDIT.md) — auditoria de segurança,
  achados (KAF-01…KAF-09), correções e verificação.
