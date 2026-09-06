/**
 * A situação das fontes declaradas ao TSE por candidatura, para o site dizer
 * DE QUEM é a lacuna quando não há material: do candidato que não informou
 * fonte nenhuma, do que só informou canais do partido, ou nossa (plataforma
 * que ainda não coletamos, coleta ainda não feita). Sem isso, "não encontrei
 * material" soa como falha do eleicoes.ai quando o candidato é que não
 * deixou fonte. Decisão do Thiago em 05/09/2026.
 *
 * Fonte: `src/data/fontes-declaradas-2026.json`, gerado no repositório privado
 * por `acervo/scripts/situacao_fontes_declaradas.py` contra o acervo da
 * release corrente (catálogo de fontes v5). Regenerar a cada release.
 * Chave: id da candidatura no TSE (o mesmo dos cards por UF).
 */
import dados from '../data/fontes-declaradas-2026.json' with { type: 'json' };

export const VOCABULARIO = Object.freeze([
  'com_material', 'sem_fonte_declarada', 'sem_material_coletado', 'so_fontes_sem_lane',
  // o canal do partido se divide por ORIGEM, e a diferença não é detalhe: num
  // caso a escolha foi do candidato, no outro fomos nós que anexamos o canal.
  // Dizer "informou ao TSE só canais do partido" para quem não informou nada
  // é afirmar falsidade sobre pessoa nomeada — eram 24 de 35 assim.
  'so_canal_de_partido_declarado', 'so_canal_de_partido_anexado',
  // valor da versão anterior do arquivo, aceito para não quebrar em release velha
  'so_canal_de_partido',
]);
export const RELEASE_FONTES = dados.release_id;

const NOMES_PLATAFORMA = {
  facebook: 'Facebook', kwai: 'Kwai', tiktok: 'TikTok', linktree: 'Linktree', telegram: 'Telegram',
  whatsapp: 'WhatsApp', flickr: 'Flickr', spotify: 'Spotify', twitch: 'Twitch', pinterest: 'Pinterest',
};

export function situacaoFontes(idTse) {
  const e = dados.candidaturas?.[String(idTse)];
  return e && VOCABULARIO.includes(e.situacao_fontes) ? e : null;
}

/** As plataformas declaradas que não coletamos, com nome legível; rótulos de URL inválida ficam de fora. */
function plataformasSemLane(e) {
  return [...new Set((e?.outras_declaradas ?? [])
    .map((r) => NOMES_PLATAFORMA[String(r).toLowerCase()])
    .filter(Boolean))];
}

function lista(itens) {
  return itens.length <= 1 ? itens.join('') : `${itens.slice(0, -1).join(', ')} e ${itens.at(-1)}`;
}

/** Uma data AAAA-MM-DD do arquivo em DD/MM/AAAA; vazio quando não há data. */
export function dataBr(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

/**
 * A linha de coleta: quando olhamos as fontes deste candidato pela última vez.
 * Vale para quem TEM material — é a pergunta que o leitor faz em seguida
 * ("isso está atualizado?"). Quem não tem material já recebe a nota da causa.
 */
export function notaColeta(e) {
  const d = dataBr(e?.ultima_coleta_em);
  return d ? `Fontes vistas em ${d}` : '';
}

/** A linha curta do card. Vazia quando há material: o card não vira placar. */
export function notaCard(e) {
  switch (e?.situacao_fontes) {
    case 'sem_fonte_declarada': return 'Não informou site nem redes sociais ao TSE';
    case 'so_canal_de_partido_declarado': return 'Informou ao TSE só o canal do partido';
    case 'so_canal_de_partido_anexado': return 'Não há material próprio; o que temos é do canal do partido';
    case 'so_canal_de_partido': return 'Não há material próprio; o que temos é do canal do partido';
    case 'sem_material_coletado': return 'Ainda não coletamos material';
    case 'so_fontes_sem_lane': {
      const p = plataformasSemLane(e);
      return p.length ? `Informou ao TSE só ${lista(p)}, que ainda não coletamos`
        : 'Informou ao TSE só endereços que ainda não coletamos';
    }
    default: return '';
  }
}

/**
 * A frase inteira da página do candidato. Vazia quando há material. Fala da
 * CANDIDATURA, não "dele/dela": o snapshot do TSE não traz gênero, e errar o
 * gênero de uma candidata na própria página dela é pior que a frase neutra.
 */
export function fraseCandidato(e) {
  switch (e?.situacao_fontes) {
    case 'sem_fonte_declarada':
      return 'Esta candidatura não informou ao TSE nenhum site ou rede social própria. Por isso o acervo não tem material dela.';
    case 'so_canal_de_partido_declarado':
      return 'Esta candidatura informou ao TSE apenas um canal do partido, e o conteúdo do partido não fala dela em nome próprio. Por isso o acervo não tem material dela.';
    case 'so_canal_de_partido_anexado':
    case 'so_canal_de_partido':
      return 'Não há material próprio desta candidatura no acervo. O que temos é do canal do partido, que não fala dela em nome próprio.';
    case 'sem_material_coletado':
      return 'Ainda não coletamos material desta candidatura: as contas informadas ao TSE estão na fila de coleta.';
    case 'so_fontes_sem_lane': {
      const p = plataformasSemLane(e);
      return `Esta candidatura informou ao TSE ${p.length ? `apenas ${lista(p)}` : 'apenas endereços'}, que o eleicoes.ai ainda não coleta. Por isso o acervo não tem material dela.`;
    }
    default: return '';
  }
}
