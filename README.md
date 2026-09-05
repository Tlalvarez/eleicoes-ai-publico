# eleicoes.ai — repositório público

O [eleicoes.ai](https://eleicoes.ai) é um site para perguntar, em português comum, o que os
candidatos às eleições gerais de 2026 registraram e disseram: programas de governo registrados no
TSE, falas em vídeo, posts nas redes e pronunciamentos oficiais dos últimos cinco anos. Cada
resposta separa o que está escrito nas fontes, o que é leitura a partir delas e o que não foi
encontrado, e leva ao documento ou vídeo original.

**Este repositório é público por desenho.** O código do site, a metodologia, o dossiê de
verificação e o histórico de mudanças ficam aqui para que qualquer pessoa confira como o site é
feito. O canal de contato e de retirada de respostas está em
[eleicoes.ai/sobre](https://eleicoes.ai/sobre); quem responde pelo site é Thiago Alvarez.

## O que o site é hoje

- **Um chat com o acervo.** A home e as páginas por cargo (Presidente e Governador, por UF)
  são a mesma conversa com escopo diferente. A resposta é gerada por IA a partir dos trechos
  recuperados para a pergunta, com as fontes citadas. As seções Senador e Deputado federal
  estão suspensas até a coleta ficar completa.
- **Um acervo de evidências por candidato**, coletado por um harness privado e publicado como
  índice (`data/acervo/indice.json`), que o gate de catálogo confere contra o canônico. As páginas
  navegáveis do acervo, o hub por candidato e as menções saíram do build em 05/09/2026
  (ninguém chegava nelas; o acervo não funcionava no celular); os endereços antigos
  redirecionam para a conversa sobre o candidato (`public/_redirects`).
- **Sem revisor humano por resposta.** As respostas são geradas e revisadas por IA, e dizem isso
  no rodapé. O responsável editorial pelo site e pelas decisões é identificado em `/sobre`.

O que o site **não** é: não recomenda voto, não ranqueia candidatos, não é checagem de fatos.

## O que está aqui

| Caminho | Conteúdo |
|---|---|
| `src/` | O site (Astro). Páginas por cargo/UF, chat, metodologia, quem faz, privacidade |
| `src/content/metodologia.md` | Metodologia atual: como as evidências são coletadas, como o chat responde, limitações |
| `src/content/verificacao/` | Dossiê: 7 anexos de verificação documental dos backtests 2002–2022 (registro histórico da v1.1) |
| `src/data/candidatos.json` | Catálogo canônico de candidatos a presidente (fonte de autoridade, editado à mão) |
| `src/data/candidaturas-*.json` | Identificadores oficiais das candidaturas no DivulgaCandContas (TSE) |
| `data/itens/` | Índice de itens por candidato: metadados e link do original (`item.schema.json`) |
| `functions/` | A única função de servidor: `/resposta/<id>`, que serve o app do chat para um link compartilhado |
| `scripts/` | Os gates de qualidade e os emissores do build (`release.json`, `_headers`) |
| `test/` | Suíte `node --test` |

Os PDFs dos programas e o conteúdo dos itens não são redistribuídos aqui: o site aponta para o
original.

## Princípios invariantes

1. Toda afirmação cita a fonte; sem fonte, a resposta diz que não encontrou.
2. Mesma varredura e mesma régua para todos os candidatos do escopo; o volume de material varia e
   isso é dito, não escondido. Candidato sem coleta aparece como lacuna declarada.
3. **Nenhuma resposta recomenda voto** ou conclui superioridade de candidato.
4. Erros e correções são registrados no histórico público deste repositório.
5. Conteúdo gerado por IA é rotulado como tal em toda superfície, inclusive no texto compartilhado.
   Não há revisão humana por resposta; há um responsável editorial identificado.

## Desenvolvimento

```bash
npm install
npm run acervo:local   # monta data/acervo (ver abaixo)
npm run dev            # servidor local
npm run build          # gera o site estático em dist/ (+ release.json e _headers)
npm test               # o gate completo
```

- **`data/acervo/` não é versionado** (é derivado da coleta). Num clone limpo,
  `npm run acervo:local` escreve um índice em que todo candidato é lacuna declarada, o suficiente
  para compilar e passar o gate. Com uma exportação real por perto, `--origem <dir>` ou
  `ACERVO_ORIGEM=<dir>` a usa por symlink. Nos dois casos o resultado é prévia interna, nunca
  release oficial.
- O chat fala com o serviço de evidências em `PUBLIC_PESQUISA_API` (padrão: mesma origem no
  build, `http://localhost:8765` no `astro dev`). Em produção é `https://api.eleicoes.ai`.
- O gate de navegador precisa de um Chrome/Chromium: defina `CHROME_BIN` se ele não estiver no
  `PATH`.
- No cliente há JavaScript só no chat; o resto é HTML estático. A medição de
  audiência (PostHog) roda só no domínio publicado, sem cookies, sem perfil de pessoa e com o
  texto da pergunta mascarado.

### Portões de qualidade

| Comando | O que cobre | Quando |
|---|---|---|
| **`npm test`** | **o gate completo: origem da home, suíte `node --test`, gate de catálogo, `astro build` real, Function compilada e verificação do HTML construído** | **obrigatório antes de entregar mudança** |
| `npm run test:unit` | o laço curto: as mesmas checagens, sem compilar | durante o desenvolvimento |
| `npm run test:integracao` | mesmo que `npm test` (nome mantido pelo operacional) | — |

A verificação do dist confere: a home é o chat e lista o catálogo inteiro; nenhum arquivo usa `innerHTML`, `set:html`, `eval` ou
`document.write` (a resposta de terceiro só vira DOM por `createElement`); a prévia não afirma
oficialidade; `_headers` tem CSP coerente com os scripts embutidos; acessibilidade básica em todas
as páginas; e o chat funciona num Chrome real contra uma API falsa.

Não há CI versionado neste repositório: o deploy é upload direto do `dist` e roda o gate antes.
`npm test` é o gate porque obrigação documental não é obrigação.

### O catálogo canônico

`src/data/candidatos.json` é a **fonte de autoridade** do catálogo de presidente: versionado,
editado à mão, é ele que declara quem deve estar publicado. O gate compara contra ele
`data/itens/resumo.json` e `data/acervo/indice.json`, que saem da mesma exportação e, sozinhos,
não provariam nada. Não existe variável de ambiente que desligue a comparação, e a ausência do
arquivo canônico é falha. Acrescentar candidato é editar esse arquivo.

Governador e Deputado federal vêm de `src/data/candidaturas-2026-uf.json` (lista do
DivulgaCandContas, uma candidatura por pessoa).

### De onde vêm os dados

O harness privado produz, por rodada, três produtos coerentes: itens, acervo e índice de
pesquisa. O site resolve `data/current.json`, o manifesto da geração ativa, e lê `itens` e
`acervo` de dentro dela. Esse manifesto não é versionado aqui: ele é artefato de deploy, e
`dist/release.json` declara de qual release o site publicado saiu. Sem manifesto (clone de
desenvolvimento), valem `data/itens` e `data/acervo` diretamente, como prévia.

### Cabeçalhos de segurança

`npm run build` emite `dist/_headers` (Cloudflare Pages) com Content-Security-Policy, HSTS,
`X-Frame-Options: DENY`, `Referrer-Policy` e `Permissions-Policy`. A CSP proíbe script inline e
autoriza pelo hash os dois que o build embute (o stub do PostHog e o filtro do acervo); por isso o
arquivo é gerado sobre o dist, não digitado. O gate de navegador serve o dist com esses cabeçalhos,
então uma CSP que quebrasse o chat cai no gate, não em produção.

## Licenças

Código sob MIT; metodologia, dossiê de verificação e índices de dados sob CC BY 4.0; retratos com
licença própria declarada em `src/data/imagens-candidatos.json`. Ver [LICENSE](LICENSE).
