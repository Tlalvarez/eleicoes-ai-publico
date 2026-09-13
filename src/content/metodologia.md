---
title: "Metodologia: como o eleicoes.ai compara os programas"
---
# Metodologia: como o eleicoes.ai compara os programas

O eleicoes.ai compara, tema a tema, os programas de governo que os candidatos de 2026 registraram no TSE: onde os programas convergem, onde divergem e sobre o que calam. Esta página explica de onde vem cada proposta, como a comparação é feita e onde ela pode falhar.

## 1. Nossos princípios

- Só programas de governo registrados no TSE. Nenhuma entrevista, rede social, notícia ou fonte externa entra na comparação.
- Não opinamos, não recomendamos voto, não ranqueamos candidatos e não prevemos resultados.
- Mostramos a proposta e o trecho do programa de onde ela saiu. O resto é com você.
- Nenhum candidato tem cor própria; as colunas ficam em ordem alfabética; as seções são pelo número de candidatos que propõem a mesma coisa, nunca por quem propõe.
- O método fica público e versionado no [histórico do repositório](https://github.com/Tlalvarez/eleicoes-ai-publico/commits/main).

## 2. De onde vem o texto

- De cada candidatura, o programa de governo é o PDF registrado no TSE, o mesmo que qualquer pessoa pode abrir no DivulgaCandContas.
- O texto é extraído do PDF, página a página, e congelado: toda etapa seguinte trabalha sobre essa mesma cópia, e o trecho que você vê ao tocar numa proposta é ela, com o número da página.
- O código divide o texto em blocos (por seção, página, parágrafo ou frase). Os blocos são uma partição exata do texto: nada é reescrito, nada fica de fora.

## 3. Etapa 1: cada bloco recebe um tema

- Um modelo de inteligência artificial (Claude Opus 5, da Anthropic) lê os blocos de um programa e devolve, para cada um, o tema de uma lista fixa (educação, saúde, segurança, economia e assim por diante). O modelo escolhe o rótulo; ele não copia nem reescreve texto.
- 100% do texto cai num de quatro baldes: um tema da lista; metadado (capa, sumário, cabeçalho, número de página); novo tema (conteúdo que não cabe na lista, com o nome que o modelo sugere); ou perdido (bloco sem rótulo válido). Bloco sem rótulo válido é declarado perdido, não adivinhado.
- A rotulagem de cada programa é validada por uma pessoa, bloco a bloco, antes de qualquer comparação. Um programa inteiro é rotulado, conferido e aprovado antes do próximo.

## 4. Etapa 2: a comparação por tema

- Por tema, o modelo lê os blocos daquele tema de todos os candidatos numa só passada e devolve uma lista de propostas. Para cada proposta, diz a posição de cada candidato: propõe, propõe o contrário ou não cita, citando os números dos blocos em que se baseou.
- O código confere cada citação: o bloco tem de existir, ser do candidato indicado e ser daquele tema. Citação que não confere é descartada.
- Uma varredura passa pelos blocos que ninguém citou e pergunta o que ficou de fora. Um cruzamento leva as propostas novas de cada candidato de volta aos outros, para ninguém ficar de fora só por ordem de leitura.
- "Propõe o contrário" é reservado à oposição explícita: o programa diz que não fará, que vai revogar ou que quer o oposto. Escolher outro caminho para o mesmo fim não é oposição. Uma segunda leitura, às cegas (sem ver o julgamento da primeira), vê só os trechos e confirma ou rebaixa cada "propõe o contrário".
- A proposta específica não se funde na genérica: "prioridade para a alfabetização" e "método fônico na alfabetização" são duas propostas, não uma.
- Os temas são consolidados em 15 páginas (economia junta contas públicas e tributos; segurança junta justiça; e assim por diante). Cada bloco entra numa página só, pela do seu tema principal, para nenhuma proposta aparecer em duas páginas.

## 5. O que está publicado hoje

- Presidente: os programas de cinco candidatos — Augusto Cury, Flávio Bolsonaro, Lula, Renan Santos e Romeu Zema — em 15 temas.
- Governador: em preparação. A página de cada estado lista as candidaturas registradas no TSE e passa a mostrar a comparação quando ela estiver pronta.

## Limitações importantes

- Modelos de inteligência artificial podem errar, inclusive ao resumir uma proposta ou ao juntar duas propostas parecidas como se fossem uma. Na dúvida, o trecho do programa vale mais que o resumo: ele está a um toque.
- Quando um candidato não aparece numa proposta, é porque o programa dele não a menciona. Isso não quer dizer que ele seja contra, nem que não tenha posição.
- A granularidade é uma escolha: outra leitura poderia dividir ou juntar propostas de outro jeito. O que não muda é o trecho de onde cada uma saiu.
- Programas têm tamanhos muito diferentes. Um candidato com mais propostas num tema escreveu mais sobre ele; isso não diz nada sobre a qualidade do que escreveu.
- O documento original vale mais que qualquer resumo. Cada proposta traz o trecho e o link do programa no TSE.

## Como este site foi feito

Não há redação nem equipe: o site foi construído e é operado por uma pessoa, com agentes
de inteligência artificial fazendo a leitura, a classificação e a comparação dos programas.
Isso é parte da explicação de por que dezenas de programas cabem numa comparação, e também
de por que a conferência é sua: cada proposta traz o trecho do original.

- **O que fizemos, linha a linha:** todo o código e o texto deste site são públicos e
  versionados; o [histórico de mudanças](https://github.com/Tlalvarez/eleicoes-ai-publico/commits/main)
  mostra o que mudou, quando e por quê.
- **Quem lê e compara os programas:** o Claude Opus 5, da Anthropic, acessado pelo gateway
  [NativePort](https://nativeport.ai), com as instruções descritas acima. As instruções são
  gerais: não citam tema nem candidato, para a mesma régua valer para todos.
- **O que o código confere:** que cada bloco citado existe e é do candidato certo, que todo o
  texto de cada programa recebeu um rótulo, e que nenhuma página do site monta texto de
  terceiro sem passar pelo renderizador seguro.
