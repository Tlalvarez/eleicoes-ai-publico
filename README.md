# eleicoes.ai — repositório público

Camada de legibilidade eleitoral para a eleição presidencial de 2026: análise dos programas de governo
registrados no TSE com metodologia pública, citação de página, teste de consistência aritmética (Teste A)
e score de executabilidade (Teste B). **Este repositório é público por desenho** — a publicação versionada
da metodologia, do changelog e das verificações é salvaguarda de neutralidade (Metodologia v1.1, §8.1).

## O que está aqui

| Caminho | Conteúdo |
|---|---|
| `src/content/metodologia.md` | Metodologia v1.1 (herda a v1.0 congelada + changelog da verificação documental) |
| `src/content/verificacao/` | Dossiê: 7 anexos de verificação documental dos backtests 2002–2022 |
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

Sem backend, sem rastreadores, sem JavaScript no cliente. O site é gerado a partir dos arquivos deste
repositório; toda mudança de conteúdo é um commit auditável.

**Nota de soft launch:** as páginas carregam `meta robots noindex` até o lançamento público — remover em `src/layouts/Base.astro`.

## Fontes primárias

Os PDFs dos programas analisados não são redistribuídos aqui (direitos autorais); os anexos citam a
proveniência exata de cada documento (TSE DivulgaCandContas, acervos partidários digitalizados e espelhos
de imprensa com verificação de integridade por hash e âncoras textuais).
