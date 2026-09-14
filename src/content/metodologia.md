---
title: "Metodologia: como o eleicoes.ai compara os programas"
---
# Metodologia: como o eleicoes.ai compara os programas

O eleicoes.ai compara os programas de governo que os candidatos a presidente e a governador registraram no TSE.

## Premissas

- Não recomendamos nenhum candidato.
- Não atribuímos a um candidato nada que não esteja escrito no programa dele.
- Não usamos outras fontes nessas comparações, apenas os programas de governo.

## Quais candidatos estamos considerando

- Os seis candidatos a presidente, e os seis candidatos a governador de cada estado, mais bem colocados na pesquisa de intenção de voto mais recente quando esta comparação foi gerada, desde que tenham pelo menos 1% das intenções de voto.
- Presidente: pesquisa Datafolha de 8 a 11/set/26. Governador: a pesquisa mais recente de cada estado, com campo entre 2 e 12/set/26.
- Não entram candidatos com registro indeferido pelo TSE nem quem não registrou programa de governo.
- Exceção: o programa de Omar Aziz (governador do Amazonas) tem 1.742 páginas em 9 volumes, a maior parte com diagnóstico do estado. Dele, só os trechos com propostas entram na comparação.

## Passo a passo da comparação de programas

1. Cada programa de governo é baixado em PDF diretamente do site do TSE.
2. Esse programa é convertido em texto, página a página.
3. O texto é dividido em blocos, e cada bloco recebe uma ou mais etiquetas de tema (ex.: Economia, Saúde), por um modelo de inteligência artificial (Claude Opus 5, da Anthropic). A primeira etiqueta é o tema principal do bloco. A lista de temas de governador é diferente da de presidente, porque as atribuições dos cargos são diferentes.
4. Por tema, o modelo lê os blocos de todos os candidatos de uma vez e separa as propostas específicas. Cada bloco entra só no seu tema principal, para que uma mesma proposta não apareça em duas páginas.
5. Para cada proposta, o modelo diz se cada candidato a propõe, propõe o contrário ou não cita, sempre apontando os trechos do programa em que se baseou. O código confere cada trecho: ele tem de existir e ser do candidato indicado.
6. Uma nova leitura passa pelos trechos que nenhuma proposta citou, e as propostas novas de cada candidato são comparadas de volta com os programas dos outros.
7. "Propõe o contrário" é só oposição explícita: o programa diz que não fará, que vai revogar ou que quer o oposto. Escolher outro caminho para o mesmo fim não é oposição. Uma segunda leitura, às cegas, confirma ou descarta cada caso.
8. Cada proposta leva a um ou mais trechos do programa original, para você conferir.

## Matriz de comparação

O resultado final é uma matriz de comparação entre os candidatos.

- Cada tema é uma página, e dentro dela as propostas são agrupadas por subtema.
- Cada proposta vira um card na coluna do candidato que a propõe.
- Quando mais de um candidato tem a mesma proposta, o card se estende sobre as colunas deles; se eles não estiverem lado a lado, o card se repete em cada coluna. Assim é possível ver onde os candidatos têm propostas semelhantes.
- Quem propõe o contrário aparece em vermelho, na própria coluna.
- Quando um candidato não aparece num card, o programa dele não fala dessa proposta. Isso não quer dizer que ele seja contra.

## Limitações

- Um modelo pode errar ao resumir uma proposta ou ao juntar duas parecidas. O trecho do programa vale mais que o resumo.
- A divisão em propostas é uma escolha; outra leitura poderia dividir ou juntar de outro jeito. O que não muda é o trecho de onde cada uma saiu.
- Os programas têm tamanhos muito diferentes. Mais propostas num tema significa que o candidato escreveu mais sobre ele, não que escreveu melhor.

## Como este site foi feito

- O site é feito e operado por uma pessoa, com agentes de inteligência artificial fazendo a leitura, a classificação e a comparação dos programas.
- As instruções dadas ao modelo são gerais: não citam tema nem candidato, para a mesma régua valer para todos.
- O código é público, e o [histórico de mudanças](https://github.com/Tlalvarez/eleicoes-ai-publico/commits/main) mostra o que mudou, quando e por quê.
