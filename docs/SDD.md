# SDD — Kaffe Note

Documento de Design de Software — Notepad web minimalista com persistência local duradoura.

- **Status:** implementado (Sprints 0–5 concluídas)
- **Pilha:** Next.js (App Router) + React + TypeScript estrito · IndexedDB (Dexie) · localStorage · Service Worker + Cache API · CSS puro
- **Plataforma:** web-first, desktop em primeiro plano; mobile secundário
- **Backend:** nenhum. Sem login, sem sync remota, sem serviços externos

---

## 1. Visão Geral e Objetivos da Arquitetura

O Kaffe Note é um bloco de notas de tela cheia: fundo preto, texto branco, sem logo,
header, nav, footer, botões ou menus. O usuário abre a página e já está escrevendo.

### Objetivos, em ordem de prioridade

| # | Objetivo | Como foi alcançado |
|---|----------|--------------------|
| 1 | O texto sobrevive a fechar aba, fechar navegador e desligar a máquina | IndexedDB com gravação em debounce + espelho síncrono em localStorage nos eventos de descarte da página |
| 2 | Zero chrome de interface | Único elemento visível é um textarea ocupando 100% da viewport, dentro de um contêiner preto fixo |
| 3 | Funciona offline após a primeira visita | Service Worker com precache do shell e runtime caching de assets |
| 4 | Sem backend e sem dependências externas | Export estático (Next.js `output: export`), deploy em qualquer host estático |
| 5 | Atalhos de teclado completos | Listener único de teclado na janela, com `preventDefault` nos combos para não acionar zoom/save do navegador |

### Decisões arquiteturais principais

- **Export estático em vez de servidor.** A aplicação não precisa de SSR em runtime; a
  página é pré-renderizada estaticamente uma vez no build. Isso elimina custo de
  servidor, permite deploy gratuito e é pré-requisito natural para PWA offline.
- **Dexie como camada de abstração sobre o IndexedDB.** Oferece API tipada e migrações
  por versão sem expor a verbosidade do IndexedDB cru.
- **Um único documento (chave fixa `default`)** no IndexedDB. O produto é um bloco de
  notas contínuo, não um gerenciador de múltiplos arquivos. O modelo é preparado para
  evoluir para múltiplas notas mudando apenas o esquema (a chave primária já é o id).
- **CSS puro, sem framework.** O visual é um reset e três classes; qualquer biblioteca
  de UI seria peso morto e violaria o requisito de minimalismo.
- **Estado React local (`useState`) sem biblioteca de gerenciamento.** Há exatamente
  dois estados persistentes (texto, tamanho de fonte) e dois transitórios (feedback de
  salvamento, alerta de armazenamento); Redux/Zustand seriam desnecessários.

---

## 2. Fluxo de Persistência e Cache Web

### 2.1 IndexedDB — conteúdo do texto

| Aspecto | Decisão |
|---------|---------|
| Biblioteca | Dexie, instância criada de forma preguiçosa (lazy) para nunca tocar em `indexedDB` durante a pré-renderização no servidor |
| Banco | `kaffe-note`, versão de esquema 1 |
| Tabela | `notes`, chave primária `id`, índice `updatedAt` |
| Registro | Um único documento: `id = "default"`, `text` (texto integral), `updatedAt` (epoch ms) |
| Escrita | Sobrescrita completa do documento (`put`) — semântica "última gravação vence" |
| Leitura | Ponto único no carregamento, comparando com o espelho (ver 2.3) |

### 2.2 localStorage — preferências e espelho de segurança

Dois usos distintos, ambos síncronos por decisão:

| Chave | Conteúdo | Motivo da escolha |
|-------|----------|-------------------|
| `kaffe.prefs.v1` | Tamanho de fonte | Leitura síncrona antes da primeira interação, sem piscar o layout |
| `kaffe.mirror.v1` | Espelho `{ text, updatedAt }` da última gravação | Gravação síncrona nos eventos em que uma promessa do IndexedDB pode ser interrompida (descarte da página) |

**Por que o espelho existe:** fechar uma aba ou desligar a máquina não espera promessas.
Nos eventos `pagehide`, `beforeunload` e `visibilitychange(hidden)`, o espelho é gravado
sincronamente (operação que o navegador completa antes de destruir a página) e, quando
há alteração pendente, dispara imediatamente a gravação assíncrona no IndexedDB.
No carregamento, o vencedor é o registro com `updatedAt` mais recente entre os dois.

**Invariante de timestamps:** o espelho e o IndexedDB recebem o **mesmo** `updatedAt`
(calculado uma única vez por gravação). Sem isso, o espelho — gravado milissegundos
depois — pareceria sempre mais novo e marcaria a nota como pendente a cada abertura,
fazendo abas ignorarem atualizações legítimas.

### 2.3 Ciclo de vida dos dados

```
Digitação ──(debounce 750ms)──▶ Grava IndexedDB + espelho (mesmo timestamp)
                                      │
                                      ├─▶ BroadcastChannel: avisa outras abas
                                      │
Qualquer momento com dirty=true ──(intervalo 5s)──▶ Gravação de segurança

pagehide / visibilitychange(hidden) ──▶ Espelho síncrono + flush imediato
beforeunload ──▶ Espelho síncrono (só se houver dirty)

Abertura ──▶ Espelho (síncrono, instantâneo) ──▶ IndexedDB (assíncrono)
           ──▶ Vence o mais recente; espelho mais novo = pendência pós-crash
```

### 2.4 Service Worker e Cache API

| Aspecto | Decisão |
|---------|---------|
| Arquivo | `public/sw.js`, registrado apenas em produção |
| Nome do cache | `kaffe-note-v1` (prefixo do projeto + versão) |
| Precache no install | Shell (`/`), manifesto PWA, ícone |
| Navegações (HTML) | *Network-first* com fallback ao cache — sempre a versão mais nova online, funciona offline |
| `/_next/static` e binários | *Cache-first* — hashes imutáveis, nunca rebuscam |
| Demais GET same-origin | *Stale-while-revalidate* |
| Ativação | Remove caches antigos com o prefixo `kaffe-note-` e assume o controle (`clients.claim`) |
| Versionamento | Alterar `CACHE_VERSION` no topo do `sw.js` a cada deploy relevante |

**Decisão sobre o texto:** o conteúdo do usuário **não** é cacheado no Cache API — ele
vive no IndexedDB, que é o storage correto para dados mutáveis do usuário. O Cache API
guarda apenas assets da aplicação.

---

## 3. Modelo de Dados e Estratégia de Auto-Save

### 3.1 Modelo de dados

| Entidade | Campos | Storage |
|----------|--------|---------|
| Nota | `id` (fixo `"default"`), `text`, `updatedAt` | IndexedDB |
| Preferências | `fontSize` | localStorage |
| Espelho | `text`, `updatedAt` | localStorage |

### 3.2 Estratégia de auto-save (múltiplas camadas)

| Gatilho | Atraso | Papel |
|---------|--------|-------|
| Debounce após digitação | 750 ms | Camada principal: não grava a cada tecla |
| Intervalo periódico | 5 s, só com alteração pendente | Rede de segurança contra anomalias |
| `visibilitychange` → hidden | Imediato | Troca de aba/app no desktop e mobile |
| `pagehide` | Imediato | Fechamento da aba (evento preferido sobre `beforeunload` em navegadores modernos) |
| `beforeunload` | Imediato (espelho síncrono) | Última linha de defesa; promessas assíncronas não são garantidas aqui |
| Ctrl+S | Imediato | Salvamento forçado com feedback visual |

**Estados da gravação:**

1. **dirty = false** — tudo persistido.
2. Usuário digita → **dirty = true**, debounce armado.
3. Gravação bem-sucedida → dirty = false, espelho sincronizado, broadcast enviado.
4. Gravação falha (cota/erro) → dirty permanece true, banner de alerta exibido,
   próxima oportunidade (intervalo/flash) tenta de novo.

### 3.3 Restauração inicial (hidratação)

Fluxo em duas etapas para evitar *hydration mismatch* do Next.js:

1. **Renderização do servidor e primeira pintura do cliente:** textarea vazio.
   Nenhum acesso a `indexedDB`/`localStorage` fora de efeitos de montagem.
2. **Efeito de montagem (cliente):**
   - Aplica preferências de fonte do localStorage.
   - Mostra imediatamente o espelho (síncrono) — texto aparece sem "piscar vazio".
   - Consulta o IndexedDB e adota o registro mais recente entre espelho e banco.
   - Se o usuário já tiver digitado antes de o carregamento concluir, o que ele
     digitou **não é sobrescrito**; a flag dirty garante que será gravado em seguida.
   - Se o espelho for mais novo que o banco, dirty é marcado (recuperação pós-crash).
3. Ao concluir, foca o textarea e posiciona o cursor no final do texto.

---

## 4. Experiência Minimalista e Atalhos de Teclado

### 4.1 A tela

- Fundo preto puro (`#000000`), texto branco puro (`#ffffff`), cursor branco.
- Um único `textarea` preenche 100% da viewport (posição fixa, sem margens).
- Nenhum header, nav, footer, logo, botão ou menu — confirmado por teste automatizado.
- Tipografia monoespaçada do sistema (sem carregar fontes externas = offline por padrão).
- Barra de rolagem escura e discreta; seleção de texto com cores invertidas.
- Ausência total de chrome não significa ausência de feedback: dois elementos
  transitórios e sutis existem — ver 4.3.

### 4.2 Atalhos

| Atalho | Ação | preventDefault |
|--------|------|----------------|
| Ctrl/Cmd + "+" ou "=" | Aumenta a fonte (passo 1px, limites 10–48px) | Sim — bloqueia zoom do navegador |
| Ctrl/Cmd + "-" | Diminui a fonte | Sim — bloqueia zoom do navegador |
| Ctrl/Cmd + 0 | Restaura 16px (padrão) | Sim — bloqueia reset de zoom |
| Ctrl/Cmd + S | Gravação imediata + feedback "salvo" | Sim — bloqueia "salvar página" |
| Ctrl/Cmd + Shift + Delete | Limpa tudo após confirmação (`window.confirm`) | Sim |

Notas de implementação:

- O listener é **único, na janela**, com verificação de `ctrlKey || metaKey` — os
  atalhos funcionam também com Cmd no macOS.
- Os combos com Shift são tratados **antes** dos sem Shift, para que
  Ctrl+Shift+Delete não caia em outro branch.
- O limite da fonte é imposto por uma função central de clamp — o mesmo caminho é
  usado por atalhos e pela restauração de preferências.
- **Limpeza:** apaga o registro do IndexedDB, o espelho de segurança e o texto na
  tela, e avisa as outras abas. As preferências (fonte) são preservadas — limpar
  conteúdo não é limpar configurações.

### 4.3 Feedback (elementos transitórios, fora do fluxo de escrita)

| Elemento | Quando aparece | Desaparece |
|----------|----------------|------------|
| Aviso "salvo"/"limpo" (canto inferior direito, 11px, cinza, discreto) | Após Ctrl+S ou limpeza | 1,5 s |
| Banner de alerta de armazenamento (inferior central, borda vermelha) | Erro de gravação ou cota > 95% usada | Até a próxima gravação bem-sucedida |

Esses são os únicos elementos além do texto — não violam o requisito de ausência de
chrome, pois são notificações temporárias, não controles de interface.

---

## 5. Arquitetura de Componentes e Estado

### 5.1 Árvore de componentes

| Componente/Arquivo | Tipo | Responsabilidade |
|--------------------|------|------------------|
| `app/layout.tsx` | Server | HTML raio, metadados, tema, manifesto PWA |
| `app/page.tsx` | Server | Compõe `Notepad` + `ServiceWorkerRegister` |
| `components/Notepad.tsx` | Client | Toda a interação: estado, auto-save, atalhos, foco, sync entre abas, alertas |
| `components/ServiceWorkerRegister.tsx` | Client | Registra o SW (somente produção) |
| `lib/db.ts` | Módulo | Abstração Dexie: load/save/clear/detecção de cota |
| `lib/prefs.ts` | Módulo | Preferências em localStorage, com clamp de fonte |

### 5.2 Estado

| Estado | Tipo | Persistência | Por quê local |
|--------|------|--------------|----------------|
| `text` | `string` | IndexedDB + espelho | É o dado central |
| `fontSize` | `number` | localStorage | Preferência |
| `hydrated` | `boolean` | — | Gate para foco/efeitos pós-carregamento |
| `notice` | `string \| null` | — | Feedback transitório |
| `storageError` | `string \| null` | — | Banner de erro transitório |

Variáveis de ciclo de vida ficam em `useRef` (`textRef`, `dirtyRef`, timers, canal) para
que os listeners de janela/navegador sempre leiam o valor atual sem *stale closures*.

### 5.3 Renderização vs. efeitos (hidratação segura)

- Todo acesso a `indexedDB`, `localStorage`, `BroadcastChannel` e `navigator.storage`
  ocorre **exclusivamente em `useEffect`**, nunca durante a renderização.
- Isso mantém servidor e primeira pintura do cliente idênticos (texto vazio), eliminando
  o erro de *hydration mismatch* do Next.js, sem precisar de suppressions.
- O `db.ts` instancia o Dexie de forma preguiçosa: o módulo pode ser importado no
  servidor sem tocar em `indexedDB`.

### 5.4 Sincronização entre abas (decisão da Sprint 5)

**Comportamento escolhido: última gravação vence, com notificação em tempo real.**

- Cada aba gera um id aleatório e publica mensagens (`saved`, `cleared`) em um
  `BroadcastChannel` nomeado `kaffe-note`.
- Uma aba que recebe atualização **só a adota se não tiver alterações pendentes**;
  se estiver digitando, mantém seu texto e sua próxima gravação sobrescreve.
- Alternativa descartada: resolução de conflitos por OT/CRDT (Spectrum/Yjs) — complexidade
  enorme para um produto de documento único sem colaboração em tempo real.

---

## 6. Estratégia de Infraestrutura e Build

| Aspecto | Decisão |
|---------|---------|
| Modo | `output: export` do Next.js — gera HTML/CSS/JS estáticos em `out/` |
| Rotas | App Router, página única, pré-renderizada estaticamente |
| URLs | `trailingSlash` para compatibilidade com hosts estáticos |
| Imagens | `images.unoptimized` (nenhuma imagem é usada no fluxo) |
| Script local | `npm run preview` — servidor estático mínimo na porta 4173 |
| Deploy | Qualquer host estático: Vercel, Netlify, nginx, GitHub Pages |
| CI | GitHub Actions: typecheck + build a cada push/PR |
| Ambientes | Sem variáveis de escopo servidor; build é idêntico em qualquer ambiente |

**Fluxo de versão do Service Worker:** alterações em shell, rotas ou estratégia exigem
incrementar `CACHE_VERSION` em `public/sw.js`. O SW novo assume o controle na ativação
e apaga os caches da versão anterior — nunca ficam dois shards de cache ativos.

---

## 7. Segurança, Privacidade e Limitações

### Privacidade (garantias por arquitetura, não por política)

- **Sem backend:** nenhum byte do texto sai do navegador. Não há endpoint de envio.
- **Sem login, sem cookies de rastreamento, sem analytics, sem fontes/CDNs externos.**
- **Sem sincronização remota:** usar dois dispositivos não propaga o conteúdo.
- Dados ficam no perfil do navegador do usuário e vão embora com "limpar dados do site".

### Limitações conhecidas e documentadas

| Limitação | Impacto | Mitigação |
|-----------|---------|-----------|
| Dados presos ao navegador/perfil | Trocar de navegador ou perfil perde o texto | Espelho dá alerta se IndexedDB falhar; usuário pode copiar o texto |
| Cota do navegador (~Origin Quota) | Gravação pode falhar | Detecção de `QuotaExceededError` + verificação proativa >95% → banner orientando a liberar espaço |
| Modo privado com storage restrito | Persistência pode falhar | Erro capturado, banner exibido; app continua utilizável |
| `beforeunload` não aguarda promessas | Fechamento abrupto pode perder até ~750 ms | Espelho síncrono nos três eventos de descarte |
| Duas abas editando ao mesmo tempo | Última gravação vence | Broadcast reduz a divergência; comportamento documentado na §5.4 |
| Sem backup/exportação | Não há como baixar o texto | Limitação aceita para o escopo atual (item de roadmap) |
| Conteúdo no IndexedDB é texto simples | Sem formatação/rich text | Decisão de produto: notepad de texto puro |

### Segurança

- Sem servidor e sem entrada de terceiros, a superfície de ataque tradicional (injeção,
  auth, XSS por API) não se aplica.
- O texto é renderizado como valor de um `textarea` (nunca como HTML) — não há como o
  conteúdo do usuário executar marcadores.
- Export estático: sem execução server-side, sem rotas de API para proteger.

---

## 8. Critérios de Aceite e Testes

### 8.1 Testes automatizados (executados e aprovados — 22 verificações)

Suíte headless com Playwright/Firefox cobrindo:

| Sprint | Verificação | Resultado |
|--------|-------------|-----------|
| 0 | Editor ocupa 100% da viewport (1280×720) | ✅ |
| 0 | Nenhum header/nav/footer/landmark de chrome | ✅ |
| 0 | Fundo `rgb(0,0,0)` e texto `rgb(255,255,255)` | ✅ |
| 5 | Cursor focado automaticamente ao abrir | ✅ |
| 1 | Texto digitado aparece no IndexedDB após debounce | ✅ |
| 2 | Texto restaurado integralmente após reload | ✅ |
| 3 | Ctrl+S exibe feedback "salvo" | ✅ |
| 3 | Ctrl+"+" aumenta a fonte | ✅ |
| 3 | Ctrl+0 restaura 16px | ✅ |
| 3 | Ctrl+"-" diminui a fonte | ✅ |
| 2 | Preferência de fonte persistida em localStorage | ✅ |
| 3 | Ctrl+Shift+Delete exibe diálogo de confirmação | ✅ |
| 3 | Confirmação limpa a tela | ✅ |
| 3 | Registro removido do IndexedDB após limpeza | ✅ |
| 5 | Estado limpo persiste após reload | ✅ |
| 4 | Service Worker registrado e **activated** | ✅ |
| 4 | App carrega em modo offline (SW serve o cache) | ✅ |
| 4 | Texto do IndexedDB disponível offline | ✅ |
| 5 | Aba B recebe texto da aba A (BroadcastChannel) | ✅ |
| 5 | Aba B restaura conteúdo consistente após reload | ✅ |
| 2/5 | Texto final sobrevive ao reload | ✅ |

Além disso: typecheck TypeScript estrito (`tsc --noEmit`) e `next build` limpos.

### 8.2 Testes manuais obrigatórios (aceitação humana)

Estes exigem intervenção física e ficam como checklist de entrega:

- [ ] **Fechar a aba** com texto não salvo e reabrir → texto íntegro
- [ ] **Fechar o navegador** por completo e reabrir → texto íntegro
- [ ] **Desligar a máquina** (sem desligamento gracioso) e religar → texto íntegro
        *(cobre o caminho do espelho síncrono no `beforeunload`)*
- [ ] **Reiniciar o sistema operacional** com a página aberta → texto íntegro
- [ ] **Restaurar sessão do navegador** (botão "restaurar abas") → texto íntegro
- [ ] **Offline real:** primeira visita, desligar a rede, fechar navegador, reabrir →
        app carrega e texto disponível
- [ ] **Duas abas:** digitar em uma → outra reflete sem recarregar
- [ ] **Desktop e teclado:** todos os atalhos funcionam sem quebrar layout
- [ ] **Mobile secundário:** app abre, texto editável, zoom não atalha o layout
- [ ] **Cota de armazenamento:** ao aproximar do limite, banner exibe alerta
- [ ] **Acessibilidade:** ao abrir, cursor já está na área de texto (sem cliques)

### 8.3 Critérios de aceite por Sprint

| Sprint | Critério | Status |
|--------|----------|--------|
| 0 | Compila, roda localmente, tela preta sem interface além do cursor | ✅ |
| 1 | Texto digitado é gravado no IndexedDB (verificável em DevTools) | ✅ |
| 2 | Fechar aba/navegador e reabrir restaura o texto | ✅ |
| 3 | Atalhos funcionam; fonte persiste; limpeza apaga tela + banco | ✅ |
| 4 | Modo offline: app e texto funcionam sem internet | ✅ |
| 5 | Resiliência em edge cases validada; sistema pronto para produção | ✅ |

---

## 9. Roadmap e Entregáveis

### 9.1 Fases concluídas

| Fase | Escopo | Entregável |
|------|--------|------------|
| Sprint 0 | Scaffolding, CSS reset, tela preta, editor full-viewport | App compilando e exibindo tela preta |
| Sprint 1 | Estado React, debounce, Dexie/IndexedDB, auto-save | Texto persistido no IndexedDB |
| Sprint 2 | Hidratação, ciclo de vida (`pagehide`/`beforeunload`), espelho | Restauração após fechar/reabrir |
| Sprint 3 | Atalhos, Ctrl+S com feedback, limpeza com confirmação | Experiência de escrita completa |
| Sprint 4 | Manifesto PWA, Service Worker, Cache API, offline | PWA funcional offline |
| Sprint 5 | Cota, múltiplas abas, foco, testes, SDD, deploy | Entrega final |

### 9.2 Entregáveis da entrega final

- Código-fonte completo (TypeScript estrito, sem dívida de tipos)
- Este documento (SDD) com as decisões reais do desenvolvimento
- `README.md` com instruções de build, preview e deploy
- Pipeline de CI (GitHub Actions: typecheck + build)
- Suíte de testes de aceitação automatizados

### 9.3 Melhorias futuras (priorização sugerida)

| Prioridade | Item | Esforço |
|------------|------|---------|
| Alta | Export/download do conteúdo em arquivo `.txt` (mitiga o risco de dados presos ao navegador) | Baixo |
| Alta | Busca e substituição (Ctrl+F dentro do app) | Médio |
| Média | Múltiplas notas com lista lateral (só aparece sob demanda, preservando o minimalismo) | Médio |
| Média | Indicador sutil de contagem de caracteres/linhas (toggle por atalho) | Baixo |
| Média | Undo/redo robusto além do nativo do textarea | Médio |
| Baixa | Tema alternativo (branco/preto invertido) como atalho | Baixo |
| Baixa | Colaboração em tempo real (CRDT — apenas se o produto evoluir nessa direção) | Alto |

---

## Apêndice — Mapa de atalhos

| Atalho | Ação |
|--------|------|
| Ctrl/Cmd + "+" | Aumentar fonte |
| Ctrl/Cmd + "-" | Diminuir fonte |
| Ctrl/Cmd + 0 | Restaurar fonte padrão (16px) |
| Ctrl/Cmd + S | Forçar salvamento (feedback "salvo") |
| Ctrl/Cmd + Shift + Delete | Limpar todo o conteúdo (com confirmação) |
