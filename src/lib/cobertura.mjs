/**
 * O que o bloco de cobertura AFIRMA — decidido aqui, desenhado no Chat.
 *
 * O bloco existe para o leitor saber de quantos candidatos havia material e de
 * quem não havia, com a causa. A decisão de o que dizer é lógica pura sobre
 * `candidatos[]`, e por isso mora fora do componente: era dentro dele, e um
 * defeito de aritmética só aparecia em produção, na tela de quem perguntou.
 *
 * O defeito que trouxe este módulo (07/09/2026, visto pelo Thiago):
 *
 *     Não encontrei material sobre receita de strogonoff — …
 *     ┌───────────────────────────────────────────────────────┐
 *     │ 13 candidatos a presidente. 13 têm material no acervo. │
 *     │ De um deles, nada que responda a esta pergunta.        │
 *     └───────────────────────────────────────────────────────┘
 *
 * Os números não estão errados — `com_material` quer dizer "a busca alcançou
 * algum material dele", e para 12 dos 13 ela alcançou alguma coisa. Errada é a
 * AFIRMAÇÃO: ao lado de uma resposta que diz não ter encontrado nada, "13 têm
 * material" e "de um deles, nada que responda" se leem como "então doze
 * responderam" — e ninguém respondeu.
 *
 * A regra: quando a própria resposta declara que não encontrou material, o
 * bloco cala sobre a busca e diz só o que é do ACERVO — de quem não há nada e
 * por quê. Isso o texto da resposta não cobre, e é o que sustenta a cobertura
 * simétrica.
 */

/** Situações que o contrato do serviço declara (ver chat.mjs). */
const COM_MATERIAL = 'com_material';
const SEM_NA_CONSULTA = 'sem_material_na_consulta';
const SEM_NO_ACERVO = 'sem_material_no_acervo';

/**
 * A resposta DECLARA que não encontrou material?
 *
 * Não é heurística sobre qualidade: é a frase que o próprio formato manda o
 * modelo escrever quando a busca não alcançou nada.
 */
export function ehNaoLocalizacao(texto) {
  const t = String(texto ?? '').toLowerCase();
  return /n[ãa]o encontrei|nenhum(a)? (dos )?(documento|trecho|fonte|material)/.test(t);
}

/**
 * As linhas do bloco, ou `null` quando não há bloco.
 *
 *   {resumo: 'texto da primeira linha',
 *    lacunas: [{causa: 'sem_fonte_declarada', nomes: ['Fulana']}]}
 *
 * `alvo` é o rótulo do escopo ("Governador de São Paulo") ou o padrão da home.
 * `causaDe(candidato)` resolve a causa — a página tem a autoridade, e o
 * payload é o reserva.
 */
export function cobertura({ candidatos, texto, alvo, causaDe = (c) => c.lacuna_causa } = {}) {
  const todos = (candidatos ?? []).filter((c) => c && c.nome);
  // com um candidato só não há cobertura a declarar: a resposta é sobre ele
  if (todos.length < 2) return null;

  const semNaConsulta = todos.filter((c) => c.situacao === SEM_NA_CONSULTA);
  const semNoAcervo = todos.filter((c) => c.situacao === SEM_NO_ACERVO);
  if (!semNaConsulta.length && !semNoAcervo.length) return null;

  const lacunas = agrupaPorCausa(semNoAcervo, causaDe);
  const naoLocalizou = ehNaoLocalizacao(texto);
  // resposta que não achou nada: o bloco não fala da busca. Se também não há
  // lacuna de acervo a declarar, ele não tem o que dizer e não aparece.
  if (naoLocalizou && !lacunas.length) return null;

  const partes = [`${todos.length} ${alvo}.`];
  if (!naoLocalizou) {
    const comAcervo = todos.filter(
      (c) => c.situacao === COM_MATERIAL || c.situacao === SEM_NA_CONSULTA).length;
    if (comAcervo) {
      partes.push(comAcervo === 1 ? 'Um tem material no acervo.'
        : `${comAcervo} têm material no acervo.`);
    }
    if (semNaConsulta.length) {
      partes.push(semNaConsulta.length === 1
        ? 'De um deles, nada que responda a esta pergunta.'
        : `De ${semNaConsulta.length} deles, nada que responda a esta pergunta.`);
    }
  }
  return { resumo: partes.join(' '), lacunas };
}

function agrupaPorCausa(candidatos, causaDe) {
  const porCausa = new Map();
  for (const c of candidatos) {
    const causa = causaDe(c) || 'sem_material_coletado';
    if (!porCausa.has(causa)) porCausa.set(causa, []);
    porCausa.get(causa).push(c.nome);
  }
  return [...porCausa].map(([causa, nomes]) => ({ causa, nomes }));
}
