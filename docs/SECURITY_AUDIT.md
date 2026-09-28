# Auditoria de Segurança — Kaffe Note

**Data da auditoria:** 25/09/2026 · **Execução das correções:** 27/09/2026 (sprints S0–S4)
**Plataforma de deploy:** Vercel · **Escopo:** aplicação client-side estática, sem backend

---

## 1. Sumário executivo

**Risco geral original: BAIXA** (1 Média, 4 Baixas, 4 Informativas) — nenhuma
vulnerabilidade explorável hoje; as lacunas eram de configuração e defesa em
profundidade. **Risco residual após as correções: BAIXA**, com todos os
achados Essenciais e Recomendados implementados e verificados por testes.

Pontos principais:

- A superfície de ataque é mínima por arquitetura: sem backend, sem
  terceiros (0 URLs externas), sem renderização de HTML do usuário
  (apenas `textarea`), sem source maps em produção, `npm audit` limpo.
- A lacuna mais importante era a **ausência total de cabeçalhos de
  segurança/CSP** — corrigida no S1, com prova de que o app funciona sob
  CSP estrita com hashes sha256 (0 violações em runtime).
- O teste de framing original provou que o app **era emoldurável**
  (clickjacking); agora é bloqueado por `frame-ancestors 'none'` +
  `X-Frame-Options: DENY`.

---

## 2. Tabela de achados e status

| ID | Severidade | Título | Status |
|----|-----------|--------|--------|
| KAF-01 | Média | Content-Security-Policy ausente | ✅ Corrigido (S1) |
| KAF-02 | Baixa | Demais cabeçalhos de segurança ausentes (framing, nosniff, referrer, permissions, HSTS) | ✅ Corrigido (S1) |
| KAF-03 | Baixa | Preview exposto na LAN + checagem de caminho contornável + crash com URI malformada | ✅ Corrigido (S2) |
| KAF-04 | Baixa | CI: actions por tag mutável; sem auditoria automática de dependências | ✅ Corrigido (S2) |
| KAF-05 | Baixa | `navigator.storage.persist()` não solicitado (evacuação de dados) | ✅ Corrigido (S2) |
| KAF-06 | Informativa | BroadcastChannel sem validação estrita de schema | ✅ Corrigido (S3) |
| KAF-07 | Informativa | Texto em claro em repouso (IndexedDB + espelho) | 📄 Decisão documentada (SDD §7) |
| KAF-08 | Informativa | Licenças LGPL-3.0/CC-BY-4.0 em dependências de build | 📄 Documentado (README) |
| KAF-09 | Informativa | SW sem atualização programática (`updateViaCache`, update no foco) | ✅ Corrigido (S3) |

Opcional avaliado e **adiado**: Trusted Types (testar compatibilidade com
React/Next após o app estar estável em produção com a CSP). Opcional fora de
segurança já presente no roadmap do SDD §9.3: export/download em `.txt`.

---

## 3. Detalhamento das correções

### KAF-01 · CSP com hashes sha256 (S1)

- **Como funciona:** o `next build` gera scripts inline no HTML e seus
  hashes mudam a cada build. O passo pós-build `scripts/inject-csp.mjs`
  (acoplado ao `npm run build`) calcula sha256 de cada script inline e
  injeta `<meta http-equiv="Content-Security-Policy">` logo após a abertura
  de `<head>` em todos os HTMLs de `out/`.
- **Diretrizes:** `default-src 'none'`; `script-src 'self'` + hashes
  (sem `'unsafe-inline'`); `style-src 'self'`; `style-src-attr
  'unsafe-inline'` (atributos `style` do React); `img-src`, `font-src`,
  `connect-src`, `manifest-src`, `worker-src` = `'self'`; `base-uri` e
  `form-action` = `'none'`.
- **`frame-ancestors`** (ignorado em meta) fica no header do `vercel.json`;
  o navegador aplica as duas políticas em conjunto (interseção).
- **Validação:** teste Playwright digita, recarrega, altera fonte e registra
  SW sob a CSP com **0 violações** em console.

### KAF-02 · Cabeçalhos de segurança no `vercel.json` (S1)

| Header | Valor |
|--------|-------|
| `Content-Security-Policy` | `frame-ancestors 'none'` |
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `no-referrer` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()` |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` (HTTPS é obrigatório e automático na Vercel) |

O `scripts/preview.mjs` aplica os mesmos headers localmente, então o teste de
framing roda contra o comportamento real do deploy.

### KAF-03 · Preview local (S2)

- `listen(port, "127.0.0.1")`: inacessível fora da máquina do desenvolvedor
  (antes: todas as interfaces).
- Checagem de caminho com **igualdade ou prefixo + separador** — bloqueia
  diretórios irmãos cujo nome começa com `out` (antes: bypass possível).
- `decodeURIComponent` com guarda: URI malformada → 404 (antes: exceção não
  tratada derrubava o servidor).
- Verificado com curl: traversal para irmão e para `package.json` não vazam;
  `/%` responde 404 e o servidor continua vivo.

### KAF-04 · Supply chain da CI (S2)

- As três actions fixadas por **SHA completo** com comentário de versão
  (antes: tag mutável `@v4`).
- Step `npm audit --audit-level=high` que falha o build em CVE
  alto/crítico.
- `.github/dependabot.yml`: atualizações semanais de `npm` e
  `github-actions`.
- `engines: node >=20.9.0` no `package.json`.

### KAF-05 · Armazenamento persistente (S2)

- `navigator.storage.persist()` chamado no mount (com verificação prévia de
  `persisted()`), melhor esforço e silencioso — evita que o navegador evacue
  o IndexedDB sob pressão de espaço.
- Teste com spy em `storage.persist` prova que o app solicita no
  carregamento (a concessão em si depende da política do navegador).

### KAF-06 · Validação das mensagens cross-tab (S3)

- Guard `isTabMessage()` valida em runtime: `sender` string, `type` conhecido,
  `text` string e `updatedAt` número para `saved`. Mensagens malformadas são
  descartadas antes de tocar no estado.
- **Evidência do problema (testada):** antes da correção, um payload com
  `text: {evil: true}` corrompia a área de texto para `"[object Object]"`;
  depois, é rejeitado e o texto permanece íntegro.

### KAF-09 · Atualização do Service Worker (S3)

- `register("/sw.js", { scope: "/", updateViaCache: "none" })` — o navegador
  sempre busca o `sw.js` da rede, nunca de cache HTTP.
- `registration.update()` ao voltar o foco da aba (throttle de 60s) — não é
  preciso esperar a próxima navegação para receber uma correção.

### KAF-07 e KAF-08 · Decisões documentadas (S4)

- **KAF-07:** texto em claro é aceito para o escopo atual (app 100% local,
  sem sync; cifrar com chave no mesmo storage teria valor limitado). Se houver
  sync no futuro: Web Crypto com chave derivada de passphrase. Documentado no
  SDD §7.
- **KAF-08:** as licenças LGPL-3.0 (binários `sharp`/libvips) e CC-BY-4.0
  (`caniuse-lite`) referem-se a dependências **apenas de build**, que não são
  distribuídas no artefato estático — sem obrigação sobre o site. Nota no
  README; incluir `caniuse-lite` em eventual página de créditos.

---

## 4. Gate de segurança no CI

`scripts/verify-headers.mjs` roda após o build em todo push/PR e falha se:

- o `vercel.json` perder qualquer header obrigatório ou trocar por valor
  inseguro;
- a meta CSP sumir do `out/index.html`, perder os hashes sha256 ou ganhar
  `'unsafe-inline'` em `script-src`.

Modo remoto para pós-deploy: `node scripts/verify-headers.mjs https://<dominio>`.

---

## 5. Verificação executada (27/09/2026)

| Verificação | Resultado |
|-------------|-----------|
| Suíte de segurança (headers, CSP, framing, persist, SW, BroadcastChannel) | 20 PASS / 0 FAIL |
| Suíte de aceitação das Sprints 0–5 (recriada, regressão zero) | 24 PASS / 0 FAIL |
| Suíte offline + multi-aba | 4 PASS / 0 FAIL |
| `verify-headers` modo config (CI) e modo URL (preview) | 14 PASS / 0 FAIL |
| Curl: bind 127.0.0.1, traversal bloqueado, URI malformada sem crash | OK |
| `tsc --noEmit` e `next build` | limpos |

**Pós-deploy real:** rodar `node scripts/verify-headers.mjs https://<dominio>`
e conferir no navegador (DevTools → Console) que não há violações de CSP.

---

## 6. Riscos residuais aceitos

- **Supply chain via npm:** mitigado por audit no CI + Dependabot + CSP
  (dano contido se um pacote comprometido executar JS); não eliminável.
- **Perda de dados por ação do usuário** ("limpar dados do site", falha de
  disco): inerente a app sem backend — mitigação é o export `.txt` (roadmap
  SDD §9.3).
- **Dispositivo comprometido/acesso físico:** qualquer código no perfil do
  navegador lê as notas (KAF-07) — fora do alcance de controle client-side.
- **Janela de atualização do SW** em abas de sessões muito longas: horas em
  cenário extremo (agora reduzida pelo `update()` no foco).
- **Trusted Types:** opcional adiado; a CSP atual já cobre os vetores
  relevantes deste app.

---

## 7. Limitações da auditoria

- Auditoria estática de código + testes locais; os headers reais dependem do
  deploy (validar com o modo URL do `verify-headers` após publicar).
- Testes de navegador executados em Firefox headless (Chromium/Safari não
  verificados nesta rodada).
- `npm audit` reflete a base de dados de 25/09/2026; dependências não
  passaram por revisão manual de código-fonte.
- Vetores não aplicáveis descartados por design: SQL Injection, CSRF,
  autenticação, autorização, APIs (não há servidor).
