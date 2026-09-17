# eleicoes.ai — repositório público

O [eleicoes.ai](https://eleicoes.ai) compara, tema a tema, os programas de governo que os
candidatos às eleições gerais de 2026 registraram no TSE: onde os programas convergem, onde
divergem e sobre o que calam. Em cada tema, uma proposta feita por mais de um candidato aparece
uma vez, sobre as colunas de quem a faz; quem propõe o contrário aparece marcado; e cada proposta
leva ao trecho do programa de onde saiu. Só programas, nenhuma fonte externa.

**Este repositório é público por desenho.** O código do site, a metodologia, o dossiê de
verificação e o histórico de mudanças ficam aqui para que qualquer pessoa confira como o site é
feito. O canal de contato está em [eleicoes.ai/sobre](https://eleicoes.ai/sobre); quem responde
pelo site é Thiago Alvarez.

## O que o site é hoje

- **A comparação para presidente.** `/presidente` redireciona para a home, que lista os temas; `/presidente/<tema>` é a
  comparação de um tema, com uma coluna por candidato (ordem alfabética), o seletor de
  candidatos e o trecho de cada programa a um toque. Hoje são 5 candidatos em 15 temas.
- **Governador, por estado.** `/governador` lista as 27 UFs; `/governador/<uf>` mostra os temas
  quando a comparação daquele estado está pronta e diz **"em preparação"** quando não está
  (com as candidaturas registradas no TSE). As rotas existem nos dois casos, para o endereço
  não mudar quando os dados chegarem.
- **Sem revisor humano por proposta.** A leitura e o agrupamento das propostas são feitos por IA
  e conferidos pelo código contra o texto dos programas; a página diz isso. O responsável
  editorial é identificado em `/sobre`.

O que o site **não** é: não recomenda voto, não ranqueia candidatos, não é checagem de fatos.
Ausência numa proposta é programa que não a menciona, não oposição.

Senador e deputado federal não registram programa de governo no TSE; os endereços antigos
redirecionam (`public/_redirects`).

## Como a comparação é feita

O texto de cada programa é extraído do PDF registrado no TSE e congelado. O código o divide em
blocos; um modelo (Claude Opus 5, da Anthropic) rotula cada bloco por tema, e a rotulagem é
validada por uma pessoa. Depois, tema a tema, o modelo lê os blocos de todos os candidatos numa
só passada e devolve propostas com a posição de cada candidato, citando blocos que o código
confere. Um juiz cego confirma cada "propõe o contrário". O detalhamento está na
[metodologia](https://eleicoes.ai/metodologia). Esse harness vive no repositório privado do
projeto (`v3/`); o que chega aqui é o resultado, exportado por `v3/exporta_site.py` para
`data/comparacao/`.

## O que está aqui

| Caminho | Conteúdo |
|---|---|
| `src/pages/` | As rotas: `/`, `/presidente`, `/presidente/[tema]`, `/governador` (`[cargo]/index`), `/governador/[uf]`, `/governador/[uf]/[tema]`, metodologia, sobre, privacidade, 404, verificação, deputado-federal |
| `src/components/Comparacao.astro` | A página de comparação: colunas, cartões, seletor de candidatos, faixa de temas, painel de trechos |
| `src/components/GradeTemas.astro`, `GradeUfs.astro`, `Candidatos.astro` | Os cartões de tema, a grade de UFs e os candidatos comparados |
| `src/lib/comparacao.mjs` | O layout da comparação — a **mesma função** roda no build (Astro) e no navegador (ao filtrar candidatos) |
| `src/lib/comparacao-dados.mjs` | Leitura e contrato dos JSONs de `data/comparacao/` |
| `src/lib/cargos.mjs`, `candidaturas-uf.mjs`, `tse.mjs` | Cargos, UFs, candidaturas do snapshot do TSE e links do DivulgaCandContas |
| `src/lib/busca.mjs` | A busca: BM25 + cosseno sobre vetores int8 + fusão RRF, agrupada por proposta; roda em Node (gabarito) e no navegador |
| `src/pages/busca.astro`, `src/components/Busca.astro` | A caixa de busca (home e página de tema) e a página de resultados sem JavaScript |
| `functions/api/vetor.js` | A única Function: o vetor da consulta (Jina via NativePort), com o segredo `NATIVEPORT_API_KEY` no projeto Pages |
| `data/busca/` | **Versionado.** Por escopo: `indice.json`, `documentos.json` (propostas com sinônimos + blocos dos programas) e os vetores `.bin` (int8) |
| `test/busca-gabarito.json` | Consultas de gente comum e o esperado; `busca-gabarito-vetores.json` traz os vetores pré-calculados (`npm run busca:gabarito-vetores`) |
| `src/lib/medicao.mjs` | A única porta da medição, com vocabulário fechado |
| `src/lib/contato.mjs` | O e-mail de contato |
| `src/content/metodologia.md` | Metodologia: como os programas são lidos e comparados, limitações |
| `src/content/verificacao/` | Dossiê: 7 anexos de verificação documental dos backtests 2002–2022 (registro histórico da v1.1) |
| `src/data/candidatos.json` | Catálogo canônico de candidatos a presidente (usado nos redirecionamentos antigos) |
| `src/data/candidaturas-*.json` | Identificadores oficiais das candidaturas no DivulgaCandContas (TSE) |
| `data/comparacao/` | **Versionado.** `paginas.json` e um JSON por página: `presidente/<pagina>.json`, `governador/<uf>/<pagina>.json` |
| `scripts/` | Os gates de qualidade e o emissor de `_headers` |
| `test/` | Suíte `node --test` |

Os PDFs dos programas não são redistribuídos aqui: cada JSON traz o texto dos blocos citados
e o link do programa no TSE.

## A busca

Híbrida e barata: lexical (BM25 com sinônimos gerados uma vez pelo modelo) + vetorial (embeddings
`jina-embeddings-v3`, 256 dimensões, int8, das propostas e de todos os blocos de tema dos
programas) + fusão RRF, tudo no navegador a partir de `data/busca/<escopo>/`. A única chamada por
consulta é `POST /api/vetor` (o vetor da consulta; ~0,00002 US$); se falhar, a busca segue só
lexical. Os dados vêm de `v3/enriquece_busca.py` + `v3/exporta_site.py` no harness. O gate
`checa-busca-dist` confere o dist; `test/busca.test.mjs` mede o recall@10 no gabarito e falha
abaixo de 0,85 no híbrido. Para a Function funcionar em produção:
`wrangler pages secret put NATIVEPORT_API_KEY --project-name eleicoes-ai`.

## Princípios invariantes

1. Toda proposta cita o trecho do programa; o código confere que o bloco citado existe e é do
   candidato certo.
2. Mesma régua para todos: as instruções ao modelo não citam tema nem candidato.
3. **Nenhuma cor por candidato, nenhum placar.** Colunas em ordem alfabética; seções pelo número
   de candidatos que propõem, nunca por quem.
4. Nada no site monta HTML a partir de string: texto de terceiro só vira DOM por
   `createElement`/`textContent` (gate `checa-render-seguro`).
5. Conteúdo gerado por IA é rotulado como tal. Erros e correções ficam no histórico público.

## Desenvolvimento

```bash
npm install
npm run dev            # servidor local
npm run build          # gera o site estático em dist/ (+ _headers)
npm test               # o gate completo: suíte + medição + build + verificação do dist
```

- O site compila de um clone limpo: tudo o que ele lê está versionado (`data/comparacao/`,
  `src/data/`). Não há harness, S3 nem serviço de API no caminho do build.
- **Seletor de candidatos:** `?c=lula,romeu-zema` mostra só esses; o layout é recalculado no
  navegador pela mesma função do build e a escolha vive só na URL (nada é gravado no navegador).
- A medição de audiência (PostHog) roda só no domínio publicado, sem cookies e sem perfil de
  pessoa. A CSP autoriza também o Cloudflare Web Analytics, mas ele **não está ligado**: conferido
  em 17/09, nenhuma página servida traz o script. Se for ligado no painel da Cloudflare, a linha
  correspondente volta a `/privacidade` no mesmo commit.
- Deploy: `npm run deploy:pages` (Cloudflare Pages, upload direto do `dist`). **Ele NÃO roda
  portão nenhum**: rode você mesmo, nesta ordem, antes de publicar — `python3
  v3/audita_metodologia.py --escopos <ufs>` (sem FALHA), `python3 v3/confere_pesquisas.py
  --dados <cadastro do TSE>` (toda pesquisa com registro) e `npm test`. A publicação sai
  desta máquina com `CLOUDFLARE_API_TOKEN="$(cat ~/Keys/cloudflare-pages.token)"`: o login
  padrão do wrangler aqui é de outra conta e o deploy morre em 403 antes de subir arquivo.

### Portões de qualidade

| Comando | O que cobre | Quando |
|---|---|---|
| **`npm test`** | **o gate completo: suíte `node --test`, gate de medição, `astro build` real e verificação do HTML construído** | **obrigatório antes de entregar mudança** |
| `npm run test:unit` | o laço curto: suíte e medição, sem compilar | durante o desenvolvimento |
| `npm run test:integracao` | mesmo que `npm test` (nome mantido pelo operacional) | — |

A verificação do dist (`test:dist`):

- `checa-paginas-dist` — a home e `/presidente` linkam todos os temas exportados; cada página
  de tema traz uma coluna por candidato, um cartão por proposta, o seletor e a faixa; as 27 UFs
  existem, com dados ou "em preparação"; nenhuma página traz o chat antigo.
- `checa-render-seguro` — nenhum arquivo de `src/` ou `dist/` usa `innerHTML`, `set:html`,
  `eval` ou `document.write`.
- `checa-cabecalhos-dist` — `_headers` tem CSP coerente com os scripts embutidos.
- `checa-acessibilidade` — idioma, título, viewport, link de pulo, um `<h1>`, `alt`, rótulos,
  sem `tabindex` positivo; alvo de toque e foco visível na folha.

E no laço curto, `checa-medicao`: `posthog.capture` só existe dentro de `medicao.mjs`, todo
`medir()` usa um evento declarado, e todo evento declarado tem chamador.

### Medição

A audiência é medida em modo sem cookies (PostHog, em `src/layouts/Base.astro`) e o produto é
medido por eventos com **vocabulário fechado**: `src/lib/medicao.mjs` é a única porta, e ela recusa
evento não declarado, propriedade fora da lista do evento e qualquer valor de texto com espaço —
a invariante que se confere num olhar, já que **prosa tem espaço**. Os eventos são oito: tema
aberto, UF aberta, proposta aberta, comparação filtrada, link do TSE aberto, busca feita e o
pedido para girar o celular (mostrado e dispensado). Os links medidos
declaram `data-evento` e as propriedades em `data-*`; um ouvinte delegado no layout chama
`medir()`. O que cada número responde está descrito em
[/privacidade](https://eleicoes.ai/privacidade).

Não há CI versionado neste repositório: o deploy é upload direto do `dist` e roda o gate antes.
`npm test` é o gate porque obrigação documental não é obrigação.

### Os dados da comparação

`data/comparacao/` é a entrada do site e é versionado: o build não depende de nada fora do
repositório. Cada JSON segue o contrato `comparacao-site/1` (`src/lib/comparacao-dados.mjs`):
candidatos na ordem das colunas, propostas com a posição de cada candidato e os blocos citados,
e o texto dos blocos com a página. Nada do harness (laudo, tokens, modelo, prompt) chega aqui —
`test/comparacao-dados.test.mjs` cobra o contrato e a ausência desses campos. Publicar um estado
de governador é exportar `governador/<uf>/*.json`: as rotas já existem.

### Cabeçalhos de segurança

`npm run build` emite `dist/_headers` (Cloudflare Pages) com Content-Security-Policy, HSTS,
`X-Frame-Options: DENY`, `Referrer-Policy` e `Permissions-Policy`. A CSP proíbe script inline e
autoriza pelo hash os que o build embute (o stub do PostHog e os dados de cada página de
comparação); por isso o arquivo é gerado sobre o dist, não digitado.

## Licenças

Código sob MIT; metodologia, dossiê de verificação e dados da comparação sob CC BY 4.0. Ver
[LICENSE](LICENSE).
