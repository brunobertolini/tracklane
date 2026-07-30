# ADR-0001 — Stack do monorepo: lib TypeScript OSS + docs estática com Fumadocs

- **Status:** aceito
- **Data:** 2026-07-30
- **Contexto de decisão:** triangulação entre três modelos (Fable, GPT-5.5 via Codex, Grok),
  com verificação empírica das versões e do comportamento real das ferramentas neste repo.

## Contexto

Repositório greenfield. Objetivo: um monorepo que siga a convenção dominante de meados de 2026
para uma biblioteca TypeScript open-source séria, mais um site de documentação **estático**
construído com **Fumadocs** (requisito fixo). Nada além disso — sem backend, sem banco, sem
features de IA.

O que é fixo por decisão do dono: licença **MIT**, deploy das docs no **GitHub Pages**,
biblioteca com **API placeholder** (o domínio será preenchido depois).

## Resumo das decisões

| # | Tema | Decisão | Alternativa mais forte rejeitada |
|---|------|---------|----------------------------------|
| 1 | Package manager | pnpm 10 + `workspace:` + `catalog:` | bun |
| 2 | Orquestrador | Turborepo (config mínima) | scripts pnpm puros |
| 3 | Layout | `packages/tln` + `apps/docs`, pacote com escopo | `packages/*` flat, nome sem escopo |
| 4 | Build da lib | tsdown (Rolldown), **ESM-only** | tsup; dual CJS+ESM |
| 5 | TypeScript | `tsconfig.base.json` na raiz, sem project references | pacote `@repo/typescript-config` |
| 6 | Testes | Vitest + coverage v8 + `expectTypeOf` | `node:test` |
| 7 | Lint/format | Biome 2.5 (ferramenta única) | ESLint 9 flat + Prettier |
| 8 | Release | Changesets + npm trusted publishing (OIDC) | semantic-release / release-please |
| 9 | CI | GitHub Actions: ci, docs, release, codeql, scorecard + Renovate | Dependabot |
| 10 | Docs | Fumadocs 16 + Next 16, `output: 'export'`, Orama static, `fumadocs-typescript` | Pagefind / Algolia / typedoc |
| 11 | Deploy docs | GitHub Pages com `basePath` | Vercel / Cloudflare Pages |
| 12 | Higiene OSS | MIT, Contributor Covenant, SECURITY, templates, **sem git hooks** | husky + commitlint |
| 13 | Extras | knip, AGENTS.md, llms.txt, CodeQL, Scorecard | — |

## Decisões

### 1. pnpm 10 com catalog

`packageManager` pinado (`pnpm@10.26.2`), `engines.node: ">=22.14.0"`, `.nvmrc` = 24.
Versões compartilhadas entre workspaces (`typescript`, `@types/node`) vivem no `catalog:`
do `pnpm-workspace.yaml` — uma única fonte de verdade, reescrita no publish.

**Rejeitado — bun:** instalação mais rápida, mas todo o caminho de publicação OSS
(Changesets, OIDC, provenance) é construído sobre npm/pnpm.

**Nota:** ficar em pnpm 10.x. Há relato de o publish via OIDC quebrar no pnpm 11.

### 2. Turborepo

Foi a única divergência real entre os três consultores (2 a favor, 1 contra). O argumento
contrário é bom: com 1 lib + 1 site, o cache quase nunca acerta, porque o docs rebuilda
sempre que a lib muda. O argumento decisivo a favor: `dependsOn: ["^build"]` dá ordem
topológica declarada em vez de ordem implícita em scripts, é o que um contribuidor espera
encontrar num monorepo TS, e o custo é um arquivo de 30 linhas.

**Rejeitado — scripts pnpm puros:** funcionam hoje, viram `&&` encadeado assim que o repo
crescer. **Rejeitado — Nx/moon:** superfície grande demais para dois workspaces.

### 3. Layout e naming

`packages/*` publica, `apps/*` deploya. O pacote leva escopo: escopo garante namespace e
elimina disputa por nome.

**Verificado:** `tln` sem escopo já está ocupado no npm (versão 1.0.3 de terceiros) — nome
sem escopo não era opção. O nome atual `@brunobertolini/tln` é **provisório**
(ver "Decisões em aberto").

### 4. tsdown, ESM-only

tsdown é o sucessor mantido do tsup, sobre Rolldown 1.x. Formato **ESM-only**: dual
CJS+ESM em 2026 é custo puro (dois grafos de output, dois conjuntos de tipos, toda a
superfície de bugs de types masquerading).

Contrato do pacote: `"type": "module"`, `sideEffects: false`, `files: ["dist"]`,
`exports` com `"types"` como **primeira** condição, sourcemaps publicados.

**Gate de CI:** `publint --strict` + `attw --pack . --profile esm-only`, rodando sobre o
**tarball real** (`pnpm pack`), não sobre o diretório. O perfil `esm-only` é o que declara
que resolução a partir de CJS não é suportada — sem ele o attw falha por design.

### 5. TypeScript

`tsconfig.base.json` na raiz, cada workspace estende. **Sem** pacote `@repo/typescript-config`:
essa convenção existe para monorepos com muitos consumidores; com dois, é indireção.
Sem project references — tsdown builda a lib, Next builda as docs.

Flags: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
`verbatimModuleSyntax`, `isolatedDeclarations` (na lib), `target: es2023`,
`moduleResolution: bundler` (validado do lado do consumidor pelo `attw`).

**Verificado empiricamente, dois ajustes necessários:**

1. `isolatedDeclarations` quebra em arquivos de config (`tsdown.config.ts`,
   `vitest.config.ts`) porque não infere default export — resolvido com anotação de tipo
   explícita, não desligando a flag.
2. `exactOptionalPropertyTypes` fica **desligado em `apps/docs`**: props de React/Fumadocs
   não são escritas contra essa flag. Ela permanece ligada na lib publicada, onde a API é nossa.

**Versão do TypeScript: 6.x, não 7.x.** O TS 7 (port em Go) já é `latest` no npm, mas o
próprio template oficial do Fumadocs ainda pina `^6.0.3`, e `fumadocs-typescript` depende de
`ts-morph`. Migrar quando o ecossistema de docs declarar suporte.

### 6. Vitest

Testes co-localizados (`src/**/*.test.ts`), testes de tipo em `*.test-d.ts` com
`expectTypeOf` e `typecheck` habilitado — sem dependência extra (nada de tsd/expect-type).
Coverage v8 com threshold de 80% apenas na lib; o site de docs não tem threshold.

### 7. Biome

Uma ferramenta para lint, format e ordenação de imports. Config única na raiz, com override
de domínios `next`/`react` para `apps/docs`.

**Rejeitado — ESLint 9 + Prettier:** duas ferramentas, duas configs, CI mais lento, para
cobertura equivalente num repo sem plugins custom. O custo para contribuidores habituados a
ESLint é real, e está mitigado documentando `pnpm lint:fix` no CONTRIBUTING.

**Armadilha verificada:** `biome.json` **não aceita comentários**. Um comentário no arquivo
faz o Biome cair silenciosamente para os defaults — o sintoma é `biome ci` varrendo
`.next/` e `out/` e reportando dezenas de milhares de erros. Se precisar comentar,
renomeie para `biome.jsonc`.

### 8. Changesets + trusted publishing

O bump semver e a nota de changelog são declarados no PR (`pnpm changeset`), revisáveis no
diff — o que é o correto para uma lib, onde a intenção de quebra não se infere de mensagem
de commit.

Publicação por **OIDC (trusted publishing)**, sem token de longa duração no repo; a
provenance é gerada automaticamente. **JSR: não** — npm é a fonte de verdade; adicionar um
segundo registro por audiência hipotética é custo sem retorno.

### 9. CI

Cinco workflows: `ci` (quality + matrix de testes Node 22/24), `docs` (build estático +
deploy no Pages), `release` (Changesets + OIDC), `codeql`, `scorecard`.

**Verificado direto nas tags dos repositórios** (não pela memória do modelo, que errou aqui):
`actions/checkout@v7`, `actions/setup-node@v7`, `pnpm/action-setup@v6`,
`actions/configure-pages@v6`, `actions/upload-pages-artifact@v5`, `actions/deploy-pages@v5`,
`changesets/action@v1`, `github/codeql-action@v4`, `ossf/scorecard-action@v2`.

Os workflows referenciam majors; o Renovate está configurado com
`helpers:pinGitHubActionDigests` e converte para SHA no primeiro PR — que é o requisito do
Scorecard, sem exigir que os SHAs sejam escritos à mão agora.

### 10. Fumadocs

Gerado pelo template oficial `+next+fuma-docs-mdx+static` (Fumadocs 16.14 / Next 16.2 /
React 19.2 / Tailwind 4). O template já entrega o que importa para export estático:
busca **Orama static** (índice em arquivo, resolvido no browser), `llms.txt` e OG images
geradas em build.

API reference via `fumadocs-typescript` + `AutoTypeTable`, lendo o **source** da lib
(`packages/tln/src/index.ts`) — a tabela de tipos é gerada do TSDoc e não pode divergir do
código. **Rejeitado — typedoc-plugin-markdown:** gera centenas de páginas ortogonais ao
design do site.

Docs versionadas: **não** por enquanto. i18n: fora de escopo.

A home importa `format()` da lib de verdade: se a lib quebrar, o build das docs quebra junto.

### 11. GitHub Pages

Site 100% estático não usa nada que um host de arquivos não sirva, e mantém código, CI,
releases e docs no mesmo provedor, sem conta extra.

**Armadilha do `basePath`, tratada:** project pages servem em `/<repo>`. O `next.config.mjs`
lê `NEXT_PUBLIC_BASE_PATH` (setado pelo workflow como `/tln`); `trailingSlash: true` e
`images.unoptimized`. O índice de busca é um arquivo buscado em runtime que o Next **não**
reescreve — por isso `staticClient({ from: \`${basePath}/api/search\` })` em
`src/components/search.tsx`. Esse é o bug clássico "busca funciona local, quebra em produção".

**Verificado:** build com `NEXT_PUBLIC_BASE_PATH=/tln` gera `out/api/search` (~22 KB) e os
assets sob `/tln/_next/…`.

### 12. Higiene OSS

MIT, Contributor Covenant 3.0, CONTRIBUTING, SECURITY (via GitHub Private Vulnerability
Reporting, não e-mail), issue forms em YAML, PR template, CODEOWNERS, `.editorconfig`,
FUNDING, AGENTS.md.

**Sem git hooks, sem commitlint.** O release não depende de mensagem de commit (Changesets),
então enforcement de commit é processo sem consumidor; lint e format são gates de CI. Hook
local só adiciona fricção para quem contribui de fora.

### 13. Extras

`knip` no CI (arquivos, deps e exports mortos), `AGENTS.md` (evita que agentes reintroduzam
tsup/ESLint/husky), `llms.txt` (vem do template), CodeQL e OpenSSF Scorecard.

## Decisões em aberto (pendem do dono)

1. **Nome e escopo definitivos do pacote.** Hoje `@brunobertolini/tln`. Trocar é um
   find/replace em: `packages/tln/package.json`, `apps/docs/package.json`,
   `.changeset/config.json`, README, docs MDX e `AGENTS.md`.
2. **Domínio custom para as docs.** Com domínio próprio, `basePath` desaparece — apague o
   `env:` do `docs.yml` e ajuste `siteUrl` em `apps/docs/src/lib/shared.ts`.
3. **Primeiro publish.** O trusted publisher é configurado por pacote no npmjs.com e o
   pacote precisa existir antes. Sequência: publish manual da 0.1.0 → configurar o trusted
   publisher apontando para `release.yml` → releases seguintes saem por OIDC.
4. **Descrição e API reais da lib.** Os pontos marcados `TODO` (package.json, README,
   `content/docs/*.mdx`, `src/index.ts`) são placeholder deliberado.

## Runbook — o que falta fazer no GitHub

- Criar o repo `brunobertolini/tln` e dar push de `develop` e `main`.
- Settings → Pages → Source: **GitHub Actions**.
- Settings → Security → habilitar **Private vulnerability reporting**.
- Branch protection em `main`: exigir os checks `Quality`, `Test (Node 22)`, `Test (Node 24)`.
- Instalar o app do **Renovate**.
- Habilitar Discussions (o `config.yml` dos issues aponta para lá).
