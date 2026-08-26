/**
 * A visão de /acervo: todo o Acervo por candidato e por fonte.
 *
 * O acervo é SUPERFÍCIE DE EVIDÊNCIA. O que ele publica é registro,
 * proveniência, cobertura e link até a fonte original — e nada mais. Não há
 * campo de juízo, destaque, relevância nem ordenação por "importância": a
 * página não produz posição sobre candidato nenhum, ela mostra o que existe.
 *
 * Três invariantes moram aqui, e não dentro do `.astro`, para poderem ser
 * cobrados por teste:
 *
 *  · **cobertura** — todo candidato do índice aparece, inclusive com zero
 *    registro, marcado como lacuna. Candidato que some por não ter material
 *    transforma buraco de cobertura em aparência de completude;
 *
 *  · **tratamento igual** — as fontes saem na MESMA ordem canônica para todos
 *    os candidatos, e os candidatos em ordem alfabética. Ordenar fonte por
 *    volume desenharia um perfil diferente para cada um a partir do que o
 *    coletor capturou, que não é medida de nada;
 *
 *  · **navegação sem página gigante** — a visão traz contadores e links para
 *    as rotas que já existem (`/acervo/<slug>/<tipo>/<ano>`), nunca a lista de
 *    itens. São dezenas de milhares de registros.
 *
 * Puro: o mesmo módulo serve ao build (que renderiza) e ao cliente (que
 * filtra o que já está na página).
 */

/**
 * A ordem em que as fontes aparecem, igual para todo candidato.
 *
 * Vai do registro mais denso e verificável (vídeo com transcrição, discurso em
 * ata) ao mais volumoso e mais raso (post de rede). É uma escala de densidade
 * de evidência, não de importância do candidato — e é fixa justamente para
 * não virar uma.
 */
export const ORDEM_TIPOS = ['video', 'aparicao', 'discurso', 'artigo',
  'pagina-arquivada', 'post-x', 'post-instagram'];

/** Rótulo humano e canal público de cada tipo de registro. */
export const FONTES = {
  video: { rotulo: 'Vídeos com transcrição', fonte: 'YouTube' },
  aparicao: { rotulo: 'Aparições em terceiros', fonte: 'YouTube (canais de terceiros)' },
  discurso: { rotulo: 'Discursos', fonte: 'Senado Federal' },
  artigo: { rotulo: 'Publicações e artigos', fonte: 'Publicações oficiais' },
  'pagina-arquivada': { rotulo: 'Páginas arquivadas', fonte: 'Sites oficiais (cópia arquivada)' },
  'post-x': { rotulo: 'Posts', fonte: 'X' },
  'post-instagram': { rotulo: 'Posts', fonte: 'Instagram' },
};

/** '0000' é o balde de item sem data — dito assim, não escondido. */
export const rotuloAno = (ano) => (String(ano) === '0000' ? 'sem data' : String(ano));

/** minúsculas sem acento, para busca que funciona com "flavio" e "Flávio". */
export function normaliza(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** Anos em ordem decrescente, com 'sem data' sempre por último. */
function ordenaAnos(anos) {
  return [...new Set(anos.map(String))].sort((a, b) => {
    if (a === '0000') return 1;
    if (b === '0000') return -1;
    return b.localeCompare(a);
  });
}

function posicaoDoTipo(tipo) {
  const i = ORDEM_TIPOS.indexOf(tipo);
  return i === -1 ? ORDEM_TIPOS.length : i;
}

/** `data/acervo/indice.json` → a visão que a página desenha. */
export function visaoDoAcervo(indice) {
  const entradas = Object.entries(indice?.candidatos ?? {});

  const candidatos = entradas.map(([slug, c]) => {
    const tipos = Object.entries(c?.tipos ?? {});
    const fontes = tipos
      .map(([tipo, d]) => {
        const anos = ordenaAnos(Object.keys(d?.anos ?? {}));
        return {
          tipo,
          rotulo: FONTES[tipo]?.rotulo ?? tipo,
          fonte: FONTES[tipo]?.fonte ?? tipo,
          total: Number(d?.total ?? 0),
          href: `/acervo/${slug}`,
          anos: anos.map((ano) => ({
            ano,
            rotulo: rotuloAno(ano),
            total: Number(d?.anos?.[ano] ?? 0),
            href: `/acervo/${slug}/${tipo}/${ano}`,
          })),
        };
      })
      .sort((a, b) => posicaoDoTipo(a.tipo) - posicaoDoTipo(b.tipo)
        || a.tipo.localeCompare(b.tipo));

    const total = fontes.reduce((s, f) => s + f.total, 0);
    return {
      slug,
      nome: c?.nome ?? slug,
      href: `/acervo/${slug}`,
      total,
      semColeta: fontes.length === 0,
      fontes,
      anos: ordenaAnos(fontes.flatMap((f) => f.anos.map((a) => a.ano))),
    };
  }).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  const porTipo = new Map();
  for (const c of candidatos) {
    for (const f of c.fontes) {
      const acc = porTipo.get(f.tipo)
        ?? { tipo: f.tipo, rotulo: f.rotulo, fonte: f.fonte, total: 0, candidatos: 0 };
      acc.total += f.total;
      acc.candidatos += 1;
      porTipo.set(f.tipo, acc);
    }
  }

  return {
    candidatos,
    fontes: [...porTipo.values()]
      .sort((a, b) => posicaoDoTipo(a.tipo) - posicaoDoTipo(b.tipo)
        || a.tipo.localeCompare(b.tipo)),
    anos: ordenaAnos(candidatos.flatMap((c) => c.anos)),
    totais: {
      candidatos: candidatos.length,
      comColeta: candidatos.filter((c) => !c.semColeta).length,
      semColeta: candidatos.filter((c) => c.semColeta).length,
      registros: candidatos.reduce((s, c) => s + c.total, 0),
    },
    geradoEm: indice?.gerado_em ?? null,
  };
}

/**
 * Um grupo da página passa nos filtros ativos?
 *
 * É o MESMO predicado no build e no cliente: a página renderiza tudo e o
 * script só esconde o que não combina, então o conteúdo essencial existe sem
 * JavaScript e o filtro não busca nada em rede.
 */
export function combina(grupo, filtros = {}) {
  const { candidato = '', fonte = '', ano = '', busca = '' } = filtros ?? {};
  if (candidato && grupo?.candidato !== candidato) return false;
  if (fonte && grupo?.fonte !== fonte) return false;
  if (ano && !(grupo?.anos ?? []).map(String).includes(String(ano))) return false;
  if (busca.trim() && !normaliza(grupo?.busca).includes(normaliza(busca))) return false;
  return true;
}

/** As opções dos seletores, derivadas da visão — nenhuma lista escrita à mão. */
export function opcoesDeFiltro(visao) {
  return {
    candidatos: visao.candidatos.map((c) => ({ valor: c.slug, rotulo: c.nome })),
    fontes: visao.fontes.map((f) => ({
      valor: f.tipo,
      rotulo: f.fonte === f.rotulo ? f.rotulo : `${f.rotulo} · ${f.fonte}`,
    })),
    anos: visao.anos.map((a) => ({ valor: a, rotulo: rotuloAno(a) })),
  };
}
