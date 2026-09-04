/**
 * A página pública de uma resposta guardada: `/resposta/<compartilhamento_id>`.
 *
 * Ela é renderizada no SERVIDOR (a função do Pages em functions/resposta) por
 * três motivos que nenhum bundle resolve: o link precisa abrir para quem não
 * executa JavaScript, precisa produzir prévia para o robô do WhatsApp e do
 * buscador, e precisa mostrar a resposta ANTES de qualquer rede no navegador
 * de quem recebeu o link.
 *
 * O que a página carrega é o contrato do produto, não decoração:
 *
 *   · a PERGUNTA como H1 — resposta sem a pergunta que a gerou é o veredito
 *     anônimo que este site existe para não produzir;
 *   · a resposta fiel, no mesmo renderizador do chat (a árvore de nós de
 *     src/lib/markdown.mjs), sem reescrita;
 *   · as FONTES originais, clicáveis, com data e ressalva de estatuto;
 *   · a data da resposta e o estado da release dos dados;
 *   · o aviso de que aquilo foi gerado por IA e a nota de neutralidade;
 *   · um caminho para fazer outra pergunta.
 *
 * E o que ela NÃO faz: listar outras respostas. Não existe índice, não existe
 * "veja também". Uma resposta é um documento avulso com endereço próprio; um
 * catálogo navegável de perguntas feitas por outras pessoas seria um produto
 * diferente, com riscos diferentes, que ninguém aprovou.
 *
 * **Todo o conteúdo aqui é hostil por premissa.** Ele vem do serviço, que
 * escreve texto de modelo sobre material de terceiros. Nada chega ao documento
 * sem passar por src/lib/html-seguro.mjs, e a normalização é a MESMA de uma
 * resposta do chat (src/lib/chat.mjs) — não há segunda porta de entrada com
 * regras próprias.
 *
 * Puro: entra dado, sai string. Quem faz rede, cabeçalho e status é a função.
 */
import { normalizaResposta } from './chat.mjs';
import { apara, conclusao, dataBr, linkWhatsApp, resumoLegivel } from './compartilhar.mjs';
import { escapaAtributo, escapaTexto, hrefPublico, paraHtml, textoDeMeta } from './html-seguro.mjs';
import { analisaMarkdown } from './markdown.mjs';
import { estadoDaResposta } from './release.mjs';
import { ORIGEM_CANONICA, urlPublica } from './resposta-publica.mjs';

const SITE = 'eleicoes.ai';
const TITULO_SEM_PERGUNTA = 'Resposta do eleicoes.ai';

/**
 * A folha da página, embutida.
 *
 * Embutida porque a função não tem como saber o nome do arquivo de CSS do
 * build (ele leva um hash que muda a cada rodada) e porque uma requisição a
 * menos é uma falha a menos no caminho de um link compartilhado. É um subconjunto
 * da identidade de src/styles/global.css — as mesmas cores, a mesma faixa, o
 * mesmo cartão.
 */
export const ESTILO = `
:root{--azul:#17365d;--azul-escuro:#102944;--azul-claro:#2d6fb7;--amarelo:#f2c94c;
--verde:#2e7d32;--laranja:#e66b3d;--papel:#f7f4ea;--cartao:#fff;--tinta:#1d1d1b;
--tinta-suave:#5d6470;--linha:#d8d9d6;--realce:#eaf0f7;--realce-atencao:#fff7d6;
--linha-atencao:#e5c95f;--atencao:#a5442a;--raio:10px;--largura:52rem;--alvo:44px;
--fonte:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;
color-scheme:light}
*{box-sizing:border-box}
body{margin:0;background:var(--papel);color:var(--tinta);font-family:var(--fonte);
line-height:1.65;overflow-x:hidden}
h1,h2,h3,h4{font-weight:700;line-height:1.16;letter-spacing:-.025em;color:var(--azul)}
h1{font-size:clamp(1.5rem,1.2rem+1.6vw,2.2rem);font-weight:800;letter-spacing:-.04em;
margin:0 0 1rem;padding-left:.9rem;border-left:4px solid var(--amarelo)}
h3{font-size:1.1rem;margin:1.5rem 0 .35rem}
h4{font-size:1rem;margin:1.1rem 0 .3rem}
p{margin:0 0 1rem}
a{color:var(--azul);text-underline-offset:.18em}
code{font-size:.9em;background:var(--realce);padding:.08rem .3rem;border-radius:4px}
hr{border:0;border-top:1px solid var(--linha);margin:1.4rem 0}
blockquote{border-left:3px solid var(--azul-claro);margin:1rem 0;padding:.1rem 1rem;
color:var(--tinta-suave)}
header.site{background:var(--azul);color:#fff}
header.site::before{content:'';display:block;height:7px;background:linear-gradient(90deg,
var(--amarelo) 0 27%,var(--verde) 27% 48%,var(--azul-claro) 48% 76%,var(--laranja) 76% 100%)}
header.site .inner,main,footer.site .inner{max-width:var(--largura);margin:0 auto;
padding-inline:1.25rem}
header.site .inner{display:flex;align-items:center;gap:1.25rem;flex-wrap:wrap;padding-block:.7rem}
.brand{font-weight:800;font-size:1.45rem;letter-spacing:-.04em;text-decoration:none;color:#fff;
min-height:var(--alvo);display:inline-flex;align-items:center}
.brand span{color:var(--amarelo)}
nav.main{display:flex;gap:.2rem;flex-wrap:wrap}
nav.main a{text-decoration:none;color:rgba(255,255,255,.86);font-size:.95rem;font-weight:600;
padding:.55rem .7rem;min-height:var(--alvo);display:inline-flex;align-items:center;border-radius:6px}
nav.main a:hover{color:#fff;background:rgba(255,255,255,.1)}
main{padding-block:2rem 3rem}
.marca-pergunta{font-size:.75rem;text-transform:uppercase;letter-spacing:.12em;font-weight:800;
color:var(--azul-claro);margin:0 0 .35rem;padding-left:1.05rem}
article.resposta{overflow:hidden;background:var(--cartao);border:1px solid var(--linha);
border-radius:var(--raio);box-shadow:0 8px 24px rgba(23,54,93,.06);padding:0 1.3rem 1.2rem}
article.resposta::before{content:'';display:block;height:5px;margin:0 -1.3rem 1.2rem;
background:linear-gradient(90deg,var(--amarelo) 0 34%,var(--verde) 34% 52%,
var(--azul-claro) 52% 78%,var(--laranja) 78% 100%)}
.resposta-corpo{font-size:1.02rem;line-height:1.7;overflow-wrap:anywhere}
.resposta-corpo>:first-child{margin-top:0}
.resposta-corpo ul,.resposta-corpo ol{padding-left:1.25rem;margin:0 0 1rem}
.resposta-corpo li{margin-bottom:.45rem}
.marcador-fonte{text-decoration:none;font-weight:700;font-size:.8em;padding:0 .1em;
color:var(--azul-claro)}
.fontes{margin-top:1.4rem;border-top:1px solid var(--linha);padding-top:.9rem}
.fontes h2{margin-top:0;font-size:.84rem;text-transform:uppercase;letter-spacing:.09em}
.fontes ol{list-style:none;padding:0;margin:0}
.fontes li{margin-bottom:.8rem;font-size:.92rem;scroll-margin-top:1rem;overflow-wrap:anywhere}
.fontes .marcas{font-weight:700;color:var(--azul-claro)}
.fontes .link-fonte{color:var(--azul-claro);font-weight:600}
.fontes .fonte-meta{color:var(--tinta-suave)}
.fontes .ressalva{display:block;font-size:.88em;margin-top:.1rem}
.fontes .ressalva.nao-conferido{color:var(--atencao);font-weight:600}
.rodape-resposta{margin-top:1rem;font-size:.85rem;color:var(--tinta-suave);
border-top:1px solid var(--linha);padding-top:.7rem}
.rodape-resposta p{margin:0 0 .25rem}
.aviso-turno{font-size:.86rem;color:var(--azul);background:var(--realce-atencao);
border:1px solid var(--linha-atencao);border-radius:8px;padding:.6rem .9rem;margin:.9rem 0 0}
.barra-compartilhar{display:flex;flex-wrap:wrap;gap:.45rem;margin-top:.9rem;padding-top:.8rem;
border-top:1px dashed var(--linha)}
.botao{font:inherit;font-size:.88rem;font-weight:600;min-height:var(--alvo);padding:.5rem .85rem;
border-radius:8px;border:1px solid var(--azul);background:var(--azul);color:#fff;cursor:pointer;
display:inline-flex;align-items:center;justify-content:center;text-decoration:none}
.botao.secundario{background:var(--cartao);color:var(--tinta);border-color:var(--linha)}
.botao[hidden]{display:none}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;
clip:rect(0,0,0,0);white-space:nowrap;border:0}
.outra-pergunta{margin:1.6rem 0 0}
footer.site{background:var(--azul-escuro);margin-top:3rem;font-size:.86rem;
color:rgba(255,255,255,.78)}
footer.site .inner{padding-block:1.5rem 2.2rem}
footer.site strong{color:#fff}
footer.site a{color:var(--amarelo)}
.independencia{border-top:1px solid rgba(255,255,255,.18);padding-top:1.1rem}
.skip-link{position:absolute;left:-9999px;top:0;background:var(--azul);color:#fff;padding:.75rem 1rem}
.skip-link:focus{left:0}
:where(a,button):focus-visible{outline:3px solid var(--amarelo);outline-offset:2px;
box-shadow:0 0 0 6px var(--azul);border-radius:4px}
`;

/**
 * O aprimoramento opcional: copiar o link e o Web Share do celular.
 *
 * Os dois botões nascem escondidos e só aparecem quando a capacidade existe.
 * Sem JavaScript a página não perde nada que importe — o WhatsApp é um `<a>`
 * comum, e o endereço está na barra do navegador. Nenhum manipulador em
 * atributo, nada de `location.href` como fonte de dado: a URL vem do
 * `<link rel="canonical">` que o servidor escreveu.
 */
export const SCRIPT = `(function () {
  var canonical = document.querySelector('link[rel="canonical"]');
  var url = canonical ? canonical.href : '';
  var molde = document.getElementById('resumo-compartilhavel');
  var resumo = molde && molde.content ? molde.content.textContent : '';
  var copiar = document.getElementById('copiar-link');
  var status = document.getElementById('status-compartilhar');
  var compartilhar = document.getElementById('compartilhar');
  if (copiar && url && navigator.clipboard) {
    copiar.hidden = false;
    copiar.addEventListener('click', function () {
      navigator.clipboard.writeText(url).then(function () {
        var antes = copiar.textContent;
        copiar.textContent = 'Copiado';
        if (status) status.textContent = 'Link copiado.';
        setTimeout(function () { copiar.textContent = antes; }, 1800);
      }, function () { if (status) status.textContent = 'Não foi possível copiar o link.'; });
    });
  }
  if (compartilhar && url && navigator.share) {
    compartilhar.hidden = false;
    compartilhar.addEventListener('click', function () {
      var p = navigator.share({ title: document.title, text: resumo, url: url });
      if (p && p.catch) p.catch(function () {});
    });
  }
})();`;

const CABECALHO = `<header class="site">
  <div class="inner">
    <a class="brand" href="/">eleicoes<span>.ai</span></a>
    <nav class="main" aria-label="Principal">
      <a href="/">Perguntar</a>
      <a href="/candidato">Candidatos</a>
      <a href="/acervo">Acervo</a>
    </nav>
  </div>
</header>`;

const RODAPE = `<footer class="site">
  <div class="inner">
    <p><strong>Transparência:</strong> as respostas são geradas por inteligência artificial
    exclusivamente a partir das evidências recuperadas para cada pergunta.</p>
    <p><strong>Neutralidade:</strong> o eleicoes.ai não recomenda voto e não ranqueia candidatos.</p>
    <p><a href="/metodologia">Metodologia</a> · conteúdo versionado · 2026</p>
    <p class="independencia">O eleicoes.ai é uma <strong>iniciativa independente</strong>, sem
    vínculo, patrocínio ou endosso da Justiça Eleitoral.</p>
  </div>
</footer>`;

/** `criado_em` só vira atributo `datetime` se tiver mesmo forma de data. */
const RE_DATA = /^\d{4}-\d{2}-\d{2}(?:[T ][0-9:.]{1,15}(?:Z|[+-]\d{2}:?\d{2})?)?$/;

function documento({ titulo, cabeca, corpo }) {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light" />
<meta name="robots" content="noindex, follow" />
<title>${escapaTexto(titulo)}</title>
${cabeca}
<style>${ESTILO}</style>
</head>
<body>
<a class="skip-link" href="#conteudo">Pular para o conteúdo</a>
${CABECALHO}
<main id="conteudo">
${corpo}
</main>
${RODAPE}
<script>${SCRIPT}</script>
</body>
</html>
`;
}

const metaNome = (nome, valor) =>
  `<meta name="${nome}" content="${escapaAtributo(valor)}" />`;
const metaProp = (prop, valor) =>
  `<meta property="${prop}" content="${escapaAtributo(valor)}" />`;

/** Uma linha de fonte, com âncora por marcador. */
function itemDeFonte(cit) {
  const [primeiro, ...resto] = cit.marcadores;
  const extras = resto.map((n) => `<span id="fonte-${n}"></span>`).join('');
  const marcas = cit.marcadores.map((n) => `[S${n}]`).join('');
  const meta = [cit.nome, cit.rotulo, dataBr(cit.data)].filter(Boolean).join(' — ')
    + (cit.ts ? `, ${cit.ts}` : '');

  const href = hrefPublico(cit.url);
  const link = href
    ? `<a class="link-fonte" href="${escapaAtributo(href)}" target="_blank"`
      + ' rel="noopener noreferrer nofollow">abrir a fonte ↗</a>'
    : '<span class="fonte-meta">(sem endereço registrado)</span>';

  let ressalva = '';
  if (cit.estatuto === 3) {
    ressalva = '<span class="ressalva nao-conferido">⚠ transcrição/legenda automática — '
      + 'pode conter erros; confira na fonte</span>';
  } else if (cit.estatuto === 4) {
    ressalva = '<span class="ressalva">✓ áudio conferido por uma segunda transcrição</span>';
  } else if (cit.estatuto === 1) {
    ressalva = '<span class="ressalva">análise do eleicoes.ai — produzida por IA e '
      + 'identificada como tal</span>';
  } else if (cit.estatuto_rotulo) {
    ressalva = `<span class="ressalva">${escapaTexto(cit.estatuto_rotulo)}</span>`;
  }

  return `<li id="fonte-${primeiro}">${extras}`
    + `<span class="marcas">${escapaTexto(marcas)} </span>`
    + `<span class="fonte-meta">${escapaTexto(meta)} </span>${link}${ressalva}</li>`;
}

/**
 * A página de uma resposta guardada.
 *
 * `id` é o identificador JÁ VALIDADO da rota, e não o que veio no JSON: o
 * endereço canônico da página não pode ser escolhido pelo conteúdo dela.
 */
export function paginaResposta(dados, { origem = ORIGEM_CANONICA, id } = {}) {
  const bruto = dados && typeof dados === 'object' ? dados : {};
  const resultado = normalizaResposta(bruto.resposta);
  const pergunta = typeof bruto.pergunta === 'string' ? bruto.pergunta : '';
  const urlPagina = urlPublica(origem, id);
  const estado = estadoDaResposta(resultado);

  const tituloVisivel = pergunta.trim() || TITULO_SEM_PERGUNTA;
  // a conclusão da resposta, sem os marcadores de fonte: `[S1]` é âncora dentro
  // da página e, numa prévia de link, vira ruído colado no meio da frase
  const semMarcadores = conclusao(resultado.texto).replace(/\s*\[S\d{1,3}\]/g, '');
  const descricao = textoDeMeta(apara(semMarcadores, 180) || tituloVisivel, 200);
  const tituloMeta = textoDeMeta(tituloVisivel, 120);

  const cabeca = [
    metaNome('description', descricao),
    urlPagina ? `<link rel="canonical" href="${escapaAtributo(urlPagina)}" />` : '',
    metaProp('og:title', tituloMeta),
    metaProp('og:description', descricao),
    urlPagina ? metaProp('og:url', urlPagina) : '',
    metaProp('og:type', 'article'),
    metaProp('og:site_name', SITE),
    metaProp('og:locale', 'pt_BR'),
    metaNome('twitter:card', 'summary'),
    metaNome('twitter:title', tituloMeta),
    metaNome('twitter:description', descricao),
  ].filter(Boolean).join('\n');

  const corpoResposta = paraHtml(analisaMarkdown(resultado.texto), {
    nivelBase: 1,
    ancora: (n) => `#fonte-${n}`,
  });

  const fontes = resultado.citacoes.length
    ? `<section class="fontes" aria-label="Fontes citadas">
<h2>Fontes citadas (${resultado.citacoes.length})</h2>
<ol>${resultado.citacoes.map(itemDeFonte).join('')}</ol>
</section>`
    : `<p class="aviso-turno">Esta resposta não trouxe nenhuma fonte citada. Sem citação não há
evidência verificável: trate o texto como indisponibilidade, não como registro.</p>`;

  const data = typeof bruto.criado_em === 'string' && RE_DATA.test(bruto.criado_em)
    ? `<p>Resposta gerada em <time datetime="${escapaAtributo(bruto.criado_em)}">`
      + `${escapaTexto(dataBr(bruto.criado_em))}</time>.</p>`
    : '<p>Resposta sem data registrada.</p>';

  const resumo = resumoLegivel({
    pergunta: tituloVisivel, texto: resultado.texto, url: urlPagina, estado: estado.rotulo,
  });
  const zap = linkWhatsApp(resumo);

  const compartilhar = `<div class="barra-compartilhar" aria-label="Compartilhar esta resposta">
${zap ? `<a class="botao secundario" href="${escapaAtributo(zap)}" target="_blank"
rel="noopener noreferrer">WhatsApp</a>` : ''}
<button type="button" class="botao secundario" id="compartilhar" hidden>Compartilhar</button>
<button type="button" class="botao secundario" id="copiar-link" hidden>Copiar link</button>
<span id="status-compartilhar" class="sr-only" role="status" aria-live="polite"></span>
</div>
<template id="resumo-compartilhavel">${escapaTexto(resumo)}</template>`;

  const corpo = `<p class="marca-pergunta">Pergunta</p>
<h1>${escapaTexto(tituloVisivel)}</h1>
<article class="resposta">
<div class="resposta-corpo">${corpoResposta}</div>
${fontes}
<div class="rodape-resposta">
${resultado.rodape ? `<p>${escapaTexto(resultado.rodape).replaceAll('/metodologia', '<a href="/metodologia">/metodologia</a>')}</p>` : ''}
${data}
<p>${escapaTexto(estado.rotulo)}</p>
</div>
<p class="aviso-turno"><strong>Resposta gerada por inteligência artificial</strong> a partir do
acervo de materiais oficiais e citações diretas reunido pelo eleicoes.ai. O site não recomenda
voto e <strong>não indica em quem votar</strong>: confira cada fonte citada acima.</p>
${compartilhar}
</article>
<p class="outra-pergunta"><a class="botao" href="/">Fazer outra pergunta ao acervo</a></p>`;

  return documento({ titulo: `${tituloMeta} · ${SITE}`, cabeca, corpo });
}

const ERROS = {
  404: {
    titulo: 'Resposta não encontrada',
    paragrafos: [
      'Este endereço não corresponde a nenhuma resposta publicada. Ou o link foi digitado '
      + 'com alguma diferença, ou a resposta que ele apontava foi retirada de circulação.',
      'Respostas podem ser retiradas — por pedido, por correção ou por revisão do acervo. '
      + 'Quando isso acontece, o endereço deixa de abrir, e é isso que você está vendo.',
    ],
  },
  502: {
    titulo: 'Não foi possível carregar esta resposta agora',
    paragrafos: [
      'A resposta existe ou não — não deu para saber neste momento, porque o serviço que '
      + 'guarda as respostas não respondeu a tempo.',
      'Isso costuma ser passageiro. Tente recarregar em alguns instantes.',
    ],
  },
};

/**
 * A página de erro.
 *
 * O 404 é UNIFORME de propósito: identificador inválido, resposta que nunca
 * existiu e resposta revogada dão exatamente esta página. Distinguir os três
 * casos entregaria, a quem varre endereços, informação sobre o acervo que a
 * rota não tem motivo para dar — inclusive a confirmação de que um
 * identificador específico já foi válido.
 *
 * O 502 não descreve a falha. "O serviço respondeu 500 em api.exemplo" é
 * diagnóstico interno; para quem lê, ele só entrega topologia.
 */
export function paginaErro(status) {
  const { titulo, paragrafos } = ERROS[status] ?? ERROS[502];
  const corpo = `<h1>${escapaTexto(titulo)}</h1>
${paragrafos.map((p) => `<p>${escapaTexto(p)}</p>`).join('\n')}
<p class="outra-pergunta"><a class="botao" href="/">Fazer uma pergunta ao acervo</a></p>`;

  return documento({
    titulo: `${titulo} · ${SITE}`,
    cabeca: metaNome('description',
      'Esta página do eleicoes.ai não está disponível. Faça uma pergunta ao acervo.'),
    corpo,
  });
}
