# eleicoes.ai — repositório público

Camada de legibilidade eleitoral para a eleição presidencial de 2026: análise dos programas de governo
registrados no TSE com metodologia pública, citação de página, teste de consistência aritmética (Teste A)
e score de executabilidade (Teste B). **Este repositório é público por desenho** — a publicação versionada
da metodologia, do changelog e das verificações é salvaguarda de neutralidade (Metodologia v1.1, §8.1).

## O que está aqui

| Caminho | Conteúdo |
|---|---|
| `src/content/metodologia.md` | Metodologia v1.1 (herda a v1.0 congelada + changelog da verificação documental) |
| `src/content/verificacao/` | Dossiê: 7 anexos de verificação documental dos backtests 2002–2022 (edição para leitura web: proveniência e integridade em frontmatter estruturado, renderizadas como box padronizado; o conteúdo analítico é idêntico ao registro de arquivo) |
| `data/fichas/ficha-candidato.schema.json` | Schema JSON das fichas por candidato (publicação: 1º/9/2026) |
| `src/` | Site estático (Astro, zero JavaScript no cliente) |

## Princípios invariantes

1. Toda classificação cita página/seção do documento primário — sem fonte, sem classificação.
2. Precedentes datados: nada posterior ao ano analisado alimenta análise ex-ante.
3. Mesma régua, mesma profundidade para todos os candidatos; omissão é classificação válida e publicável.
4. **Nenhum output recomenda voto** ou conclui superioridade de candidato; análises terminam em trade-offs.
5. Erros e correções são registrados honestamente em changelog público.
6. Rotulagem de conteúdo assistido por IA + revisão editorial humana identificada, conforme resoluções do TSE.

## Desenvolvimento

```bash
npm install
npm run dev     # servidor local
npm run build   # gera o site estático em dist/
```

Sem backend próprio nas páginas; JavaScript no cliente só no chat da home; medição de audiência com
PostHog em modo sem cookies (nada gravado no navegador, sem dados pessoais, sem o texto das perguntas).
O site é gerado a partir dos arquivos deste repositório; toda mudança de conteúdo é um commit auditável.

### Portões de qualidade

| Comando | O que cobre | Quando |
|---|---|---|
| **`npm test`** | **o gate completo: origem da home, suíte `node --test`, gate de catálogo, `astro build` real e verificação do HTML construído** | **obrigatório antes de entregar mudança** |
| `npm run test:unit` | o laço curto: as mesmas checagens, sem compilar | durante o desenvolvimento |
| `npm run test:integracao` | mesmo que `npm test` (nome mantido pelo operacional) | — |

O gate completo custa ~22 s e ~510 MiB de pico. Antes ele vivia num script
separado, declarado obrigatório só aqui no README — e obrigação documental não
é obrigação: quem digitava `npm test` via verde sem nunca ter compilado o site.
Não há CI versionado neste repositório para compensar isso, então o comando
convencional passou a ser o gate.

### O catálogo canônico

`src/data/candidatos.json` é a **fonte de autoridade** do catálogo: versionado,
editado à mão, é ele que declara quem deve estar publicado. O gate compara
contra ele:

- `data/itens/resumo.json` (hub, arquivo, menções);
- `data/acervo/indice.json` (acervo navegável);
- `data/current.json → catalogo`, o catálogo declarado pela geração ativa;
- a tabela `candidatos` do índice de pesquisa da geração, lida diretamente
  quando o runtime tem `node:sqlite`.

Comparar apenas os dois derivados entre si não provava nada: eles saem da mesma
exportação, e uma exportação que perdesse um candidato produziria os dois
igualmente errados. Não existe variável de ambiente que desligue a comparação,
e a ausência do arquivo canônico é falha — um gate cuja autoridade é opcional
não é gate.

Acrescentar candidato é editar esse arquivo; o gate cai enquanto os derivados
não trouxerem exatamente a lista declarada.

### De onde vêm os dados

O site resolve `data/current.json` — o manifesto da geração ativa publicada
pelo harness — e lê `itens` e `acervo` de dentro dela. Os três produtos da
rodada (itens, acervo e índice de pesquisa) nascem sob `data/geracoes/<id>/` e
viram públicos pela troca desse único ponteiro, então o site e a pesquisa
sempre servem a MESMA geração.

Enquanto a migração operacional não acontece, `data/current.json` não existe e
os diretórios `data/itens` e `data/acervo` continuam valendo, sem nenhuma
mudança de comportamento.

**Nota de soft launch:** as páginas carregam `meta robots noindex` até o lançamento público — remover em `src/layouts/Base.astro`.

## Fontes primárias

Os PDFs dos programas analisados não são redistribuídos aqui (direitos autorais); os anexos citam a
proveniência exata de cada documento (TSE DivulgaCandContas, acervos partidários digitalizados e espelhos
de imprensa com verificação de integridade por hash e âncoras textuais).
