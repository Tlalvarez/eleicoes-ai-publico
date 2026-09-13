---
title: "Metodologia: como o eleicoes.ai compara os programas"
---
# Metodologia: como o eleicoes.ai compara os programas

O eleicoes.ai compara, assunto por assunto, os programas de governo que os candidatos a presidente registraram no TSE. Esta página diz de onde vem cada proposta, como ler a comparação e onde ela pode falhar.

## O que entra

- Só o programa de governo registrado no TSE, o mesmo PDF que qualquer pessoa abre no DivulgaCandContas. Nenhuma entrevista, rede social, notícia ou fonte externa.
- Hoje: os programas de Augusto Cury, Flávio Bolsonaro, Lula, Renan Santos e Romeu Zema, em 15 temas. Os demais candidatos entram à medida que a leitura dos programas for concluída e validada.
- Não opinamos, não recomendamos voto, não ranqueamos. Nenhum candidato tem cor própria; as colunas ficam em ordem alfabética.

## Como as propostas são extraídas

1. **O texto é congelado.** O PDF é convertido em texto, página a página, e dividido em blocos. Nada é reescrito: o trecho que você lê ao tocar numa proposta é o texto do programa, com o número da página.
2. **Cada bloco recebe um tema.** Um modelo de inteligência artificial (Claude Opus 5, da Anthropic) lê os blocos e escolhe, para cada um, o tema de uma lista fixa. Bloco que não cabe na lista é marcado como tal, não encaixado à força. A rotulagem de cada programa é conferida por uma pessoa antes da comparação.
3. **Por tema, as propostas são comparadas.** O modelo lê os blocos de todos os candidatos de uma vez e devolve as propostas, dizendo de cada candidato se propõe, se propõe o contrário ou se não cita — sempre apontando os blocos em que se baseou. O código confere cada citação: o bloco tem de existir e ser do candidato indicado. Uma varredura passa pelo que ninguém citou, e um cruzamento leva as propostas novas de cada candidato de volta aos outros.
4. **"Propõe o contrário" é oposição explícita.** O programa diz que não fará, que vai revogar ou que quer o oposto. Escolher outro caminho para o mesmo fim não é oposição. Uma segunda leitura, às cegas, confirma ou rebaixa cada caso.

## Como ler a comparação

- Cada tema é uma página; cada assunto, uma seção. Uma proposta feita por mais de um candidato aparece uma vez, sobre as colunas de quem a faz; quando os candidatos não são vizinhos, o texto se repete em cada coluna.
- Quem propõe o contrário aparece em vermelho, na própria coluna.
- Quando um candidato não aparece numa proposta, o programa dele não a menciona. Isso não quer dizer que ele seja contra.
- Você pode tirar e pôr candidatos na comparação; a escolha fica no endereço da página, para compartilhar.
- A busca procura nas propostas e no texto integral dos programas, por palavras e por sentido, e mostra a mesma matriz só com o que fala do assunto, de todos os temas. Tudo roda no seu navegador; ao servidor vai apenas a consulta, para virar um vetor de busca.

## Limitações

- Um modelo pode errar ao resumir uma proposta ou ao juntar duas parecidas. O trecho do programa vale mais que o resumo, e está a um toque.
- A divisão em propostas é uma escolha; outra leitura poderia dividir ou juntar de outro jeito. O que não muda é o trecho de onde cada uma saiu.
- Programas têm tamanhos muito diferentes. Mais propostas num tema significa que o candidato escreveu mais sobre ele, não que escreveu melhor.

## Como este site foi feito

O site foi construído e é operado por uma pessoa, com agentes de inteligência artificial fazendo a leitura, a classificação e a comparação dos programas. O código e o texto são públicos: o [histórico de mudanças](https://github.com/Tlalvarez/eleicoes-ai-publico/commits/main) mostra o que mudou, quando e por quê. O modelo é o Claude Opus 5, acessado pelo gateway [NativePort](https://nativeport.ai), com instruções gerais que não citam tema nem candidato, para a mesma régua valer para todos.
