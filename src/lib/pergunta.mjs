/**
 * Entender a pergunta antes de buscar (PROTÓTIPO B, 18/09/2026).
 *
 * Quem achou a caixa de busca escreveu PERGUNTA, não palavra: "compare os programas
 * de lula e flávio bolsonaro em relação a segurança e justiça". A busca tratava a
 * frase inteira como termos e errava dos dois jeitos — "armas" trazia 28 propostas e
 * "quem é a favor de armas?" trazia 2; "o que o Lula propõe para a saúde?" abria com
 * cultura, e as seis colunas continuavam na tela.
 *
 * Uma pergunta tem até três partes, e cada uma já tem lugar no site:
 *   · QUEM  — nomes de candidato viram a seleção de colunas (`?c=`);
 *   · TEMA  — o nome de uma página vira a página, quando não sobra mais nada a buscar;
 *   · O QUÊ — o resto, sem a moldura da pergunta ("quem", "compare", "propõe"…), é o
 *             que vai para a busca.
 *
 * Sem modelo e sem texto gerado: os vocabulários são fechados e vêm dos DADOS do
 * escopo (candidatos e páginas de documentos.json). Nada aqui conhece um candidato ou
 * um tema pelo nome — a função vale igual para presidente e para qualquer UF.
 */
import { normaliza, raiz, STOP } from './busca.mjs';

/** A moldura de uma pergunta sobre programas: palavras que perguntam, não que descrevem o assunto. */
export const MOLDURA = new Set(('quem qual quais compare comparar comparacao comparando comparativo diferenca diferencas '
  + 'programa programas plano planos governo proposta propostas propoe propoem propor propos '
  + 'candidato candidatos candidata candidatas fala falam falar diz dizem dizer pensa pensam acha acham '
  + 'relacao respeito favor pretende pretendem defende defendem promete prometem quer querem vai vao '
  + 'saber gostaria mostre mostrar me diga').split(/\s+/));

const palavras = (s) => normaliza(s).split(/[^a-z0-9]+/).filter(Boolean);
/** As palavras como a pessoa escreveu (com acento e caixa), ao lado da forma normalizada que decide. */
const comGrafia = (s) => String(s ?? '').split(/[^\p{L}\p{N}]+/u).filter(Boolean).map((g) => ({ g, t: normaliza(g) }));
const dePeso = (t) => t.length >= 3 && !STOP.has(t);

/**
 * `candidatos`: [{slug, nome}]; `paginas`: [{id, nome}]; `vocabulario`: Set com a raiz
 * das palavras que aparecem no TEXTO das propostas do escopo — um nome que também é
 * palavra de proposta ("Ruas", "Coronel") só conta como nome se vier com outro pedaço
 * do mesmo nome, senão "asfaltar ruas" tiraria cinco candidatos da tela.
 *
 * Devolve { candidatos: [slug…] na ordem dada, tema: id|null, conteudo: string }.
 * `conteudo` é o que buscar; vazio quer dizer que a pergunta era só quem e/ou tema.
 */
export function entendePergunta(q, { candidatos = [], paginas = [], vocabulario = new Set() } = {}) {
  const escritas = comGrafia(q);
  const toks = escritas.map((x) => x.t);

  // ------------------------------------------------------------------ quem
  const donos = new Map();   // pedaço de nome -> slugs que o têm
  for (const c of candidatos) {
    for (const t of new Set(palavras(c.nome).filter(dePeso))) {
      if (!donos.has(t)) donos.set(t, new Set());
      donos.get(t).add(c.slug);
    }
  }
  const batidas = new Map();  // slug -> pedaços do nome presentes na pergunta
  for (const t of toks) {
    const d = donos.get(t);
    if (!d || d.size !== 1) continue;            // pedaço de dois candidatos não escolhe nenhum
    const [slug] = d;
    if (!batidas.has(slug)) batidas.set(slug, new Set());
    batidas.get(slug).add(t);
  }
  const escolhidos = new Set();
  const deNome = new Set();
  for (const [slug, ts] of batidas) {
    const soPalavraComum = [...ts].every((t) => vocabulario.has(raiz(t)));
    if (soPalavraComum && ts.size < 2) continue;
    escolhidos.add(slug);
  }
  // do candidato escolhido sai o nome INTEIRO, inclusive o pedaço curto que não escolhe
  // ninguém sozinho: "Dr. Furlan" deixava "Dr" na consulta (a varredura dos 28 escopos pegou)
  for (const c of candidatos) if (escolhidos.has(c.slug)) for (const t of palavras(c.nome)) deNome.add(t);

  // ------------------------------------------------------------------ tema
  const restoEscrito = escritas.filter((x) => !deNome.has(x.t));
  const resto = restoEscrito.map((x) => x.t);
  const votos = new Map();
  for (const p of paginas) {
    const doNome = new Set(palavras(p.nome).filter(dePeso).map(raiz));
    const n = new Set(resto.filter(dePeso).map(raiz).filter((t) => doNome.has(t))).size;
    if (n) votos.set(p.id, { n, fracao: n / doNome.size, termos: doNome });
  }
  let tema = null;
  if (votos.size) {
    const ordenados = [...votos].sort((a, b) => b[1].n - a[1].n || b[1].fracao - a[1].fracao);
    const empate = ordenados.length > 1 && ordenados[0][1].n === ordenados[1][1].n && ordenados[0][1].fracao === ordenados[1][1].fracao;
    if (!empate) tema = ordenados[0][0];
  }

  // ------------------------------------------------------------------ o quê
  // o que vai para a busca (e para a tela) é o que a pessoa escreveu: "privatização", não "privatizacao"
  // duas letras bastam para o assunto ("IA", "5G"), como na busca; nome e tema pedem três
  const assunto = restoEscrito.filter((x) => x.t.length >= 2 && !STOP.has(x.t) && !MOLDURA.has(x.t));
  const doTema = tema ? votos.get(tema).termos : new Set();
  const alemDoTema = assunto.filter((x) => !doTema.has(raiz(x.t)));
  // só o tema (e/ou quem): a página do tema responde melhor que uma busca pela palavra "saúde"
  const conteudo = tema && !alemDoTema.length ? '' : assunto.map((x) => x.g).join(' ');

  return {
    candidatos: candidatos.map((c) => c.slug).filter((s) => escolhidos.has(s)),
    tema: conteudo ? null : tema,
    conteudo,
  };
}

/** A raiz de cada palavra de peso do texto das propostas: o vocabulário que desambigua nomes. */
export function vocabularioDasPropostas(propostas) {
  const v = new Set();
  for (const p of propostas) for (const t of palavras(`${p.subtema ?? ''} ${p.texto ?? ''}`)) if (dePeso(t)) v.add(raiz(t));
  return v;
}
