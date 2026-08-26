/**
 * Markdown seguro: o texto da resposta vira ÁRVORE DE NÓS, nunca string de
 * HTML.
 *
 * A página de pesquisa montava a resposta com `innerHTML` sobre um
 * mini-markdown que escapava à mão. Escapar à mão é uma corrida que se perde:
 * bastou um `[texto](javascript:…)` — que o formato "Candidatos" usa o tempo
 * todo, porque ele é feito de links para as fontes — para haver execução de
 * script vindo de texto de terceiro. Aqui o parser não produz marcação: ele
 * produz nós, e `criaElementos` os materializa com createElement/textContent.
 * Não existe caminho em que um caractere de origem vire estrutura.
 *
 * O formato "Candidatos" (tópico do Telegram) exige: conclusão primeiro,
 * títulos de seção, bullets, negrito/itálico, separador entre blocos
 * comparativos e link direto para cada fonte. É esse conjunto que está
 * coberto abaixo.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  analisaMarkdown, criaElementos, hrefSeguro, paraTextoSimples,
} from '../src/lib/markdown.mjs';

// --------------------------------------------------------------------------
// DOM mínimo: prova que criaElementos só usa createElement/createTextNode/
// setAttribute/appendChild — nada de innerHTML. Um nó que tentasse escrever
// HTML aqui explodiria, porque a propriedade não existe.
// --------------------------------------------------------------------------
function domFalso() {
  const cria = (tag) => ({
    tag, filhos: [], atributos: {},
    appendChild(n) { this.filhos.push(n); return n; },
    setAttribute(k, v) { this.atributos[k] = String(v); },
    get textContent() {
      return this.filhos.map((f) => f.texto ?? f.textContent ?? '').join('');
    },
    set textContent(v) { this.filhos = [{ texto: String(v) }]; },
  });
  return {
    createElement: (tag) => cria(tag),
    createTextNode: (texto) => ({ tag: '#texto', texto: String(texto) }),
    createDocumentFragment: () => cria('#fragmento'),
  };
}

const monta = (md) => criaElementos(analisaMarkdown(md), domFalso());
const achaTags = (no, tag, saida = []) => {
  if (no.tag === tag) saida.push(no);
  for (const f of no.filhos ?? []) achaTags(f, tag, saida);
  return saida;
};

// --------------------------------------------------------------------------
// blocos do formato "Candidatos"
// --------------------------------------------------------------------------

test('parágrafo simples vira um bloco de parágrafo', () => {
  assert.deepEqual(analisaMarkdown('Conclusão primeiro.'), [
    { t: 'p', filhos: [{ t: 'texto', valor: 'Conclusão primeiro.' }] },
  ]);
});

test('títulos de seção de nível 1 a 4', () => {
  const nos = analisaMarkdown('# Um\n\n## Dois\n\n### Três\n\n#### Quatro');

  assert.deepEqual(nos.map((n) => [n.t, n.nivel]),
    [['h', 1], ['h', 2], ['h', 3], ['h', 4]]);
});

test('linhas seguidas viram UM parágrafo, com quebra macia', () => {
  const [p] = analisaMarkdown('linha um\nlinha dois');

  assert.equal(p.t, 'p');
  assert.deepEqual(p.filhos.map((f) => f.t), ['texto', 'quebra', 'texto']);
});

test('bullets viram lista, com ou sem asterisco', () => {
  const [ul] = analisaMarkdown('- primeiro\n* segundo\n- terceiro');

  assert.equal(ul.t, 'ul');
  assert.equal(ul.itens.length, 3);
  assert.equal(ul.itens[1].filhos[0].valor, 'segundo');
});

test('lista numerada preserva o número inicial', () => {
  const [ol] = analisaMarkdown('3. terceiro\n4. quarto');

  assert.equal(ol.t, 'ol');
  assert.equal(ol.inicio, 3);
  assert.equal(ol.itens.length, 2);
});

test('bullet indentado vira sublista, não item irmão', () => {
  const [ul] = analisaMarkdown('- pai\n  - filho\n  - outro filho\n- tio');

  assert.equal(ul.itens.length, 2);
  const sub = ul.itens[0].filhos.find((f) => f.t === 'ul');
  assert.ok(sub, 'o item não recebeu sublista');
  assert.equal(sub.itens.length, 2);
});

test('separador entre blocos comparativos', () => {
  const nos = analisaMarkdown('A\n\n---\n\nB');

  assert.deepEqual(nos.map((n) => n.t), ['p', 'hr', 'p']);
});

test('citação em bloco preserva os blocos internos', () => {
  const [q] = analisaMarkdown('> Lacuna: nada registrado.\n> Segunda linha.');

  assert.equal(q.t, 'citacao');
  assert.equal(q.filhos[0].t, 'p');
});

test('linhas em branco extras não geram parágrafo vazio', () => {
  assert.deepEqual(analisaMarkdown('\n\n\nA\n\n\n\nB\n\n').map((n) => n.t), ['p', 'p']);
});

test('texto vazio não gera nó nenhum', () => {
  for (const v of ['', '   \n\n  ', null, undefined]) {
    assert.deepEqual(analisaMarkdown(v), [], `entrada ${JSON.stringify(v)}`);
  }
});

// --------------------------------------------------------------------------
// inline
// --------------------------------------------------------------------------

test('negrito e itálico', () => {
  const [p] = analisaMarkdown('um **forte** e um *fraco* e um _outro_');

  assert.deepEqual(p.filhos.map((f) => f.t),
    ['texto', 'forte', 'texto', 'enfase', 'texto', 'enfase']);
  assert.equal(p.filhos[1].filhos[0].valor, 'forte');
});

test('negrito dentro de bullet — o molde do formato "Candidatos"', () => {
  const [ul] = analisaMarkdown('- **Evidência:** disse X em 2025.');

  assert.equal(ul.itens[0].filhos[0].t, 'forte');
  assert.equal(ul.itens[0].filhos[0].filhos[0].valor, 'Evidência:');
});

test('asterisco solto continua sendo asterisco', () => {
  const [p] = analisaMarkdown('2 * 3 = 6');

  assert.equal(paraTextoSimples(analisaMarkdown('2 * 3 = 6')), '2 * 3 = 6');
  assert.deepEqual(p.filhos.map((f) => f.t), ['texto']);
});

test('código em linha não é interpretado como marcação', () => {
  const [p] = analisaMarkdown('use `**isto**` literal');

  const cod = p.filhos.find((f) => f.t === 'codigo');
  assert.equal(cod.valor, '**isto**');
});

test('link com rótulo vira nó de link', () => {
  const [p] = analisaMarkdown('veja [o vídeo](https://youtube.com/watch?v=a1) agora');

  const link = p.filhos.find((f) => f.t === 'link');
  assert.equal(link.href, 'https://youtube.com/watch?v=a1');
  assert.equal(link.filhos[0].valor, 'o vídeo');
});

test('URL solta vira link, sem levar a pontuação final junto', () => {
  const [p] = analisaMarkdown('fonte: https://exemplo.org/a/b?c=1.');

  const link = p.filhos.find((f) => f.t === 'link');
  assert.equal(link.href, 'https://exemplo.org/a/b?c=1');
  assert.equal(p.filhos.at(-1).valor, '.');
});

test('marcador de citação [S3] vira nó próprio, não texto', () => {
  const [p] = analisaMarkdown('afirmou isso [S3] em agosto');

  const m = p.filhos.find((f) => f.t === 'marcador');
  assert.equal(m.n, 3);
});

test('marcadores múltiplos no mesmo ponto', () => {
  const [p] = analisaMarkdown('afirmou [S1][S2] isso');

  assert.deepEqual(p.filhos.filter((f) => f.t === 'marcador').map((f) => f.n), [1, 2]);
});

// --------------------------------------------------------------------------
// segurança
// --------------------------------------------------------------------------

test('hrefSeguro aceita http, https, mailto e caminho do próprio site', () => {
  for (const u of ['https://a.org/x', 'http://a.org', 'mailto:a@b.org',
    '/acervo/lula', '#fonte-1', '/acervo/lula?ano=2026']) {
    assert.equal(hrefSeguro(u), u, u);
  }
});

test('hrefSeguro recusa javascript:, data: e vbscript:', () => {
  for (const u of ['javascript:alert(1)', 'JavaScript:alert(1)',
    'java\tscript:alert(1)', ' javascript:alert(1)', 'data:text/html,<script>',
    'vbscript:msgbox', 'javascript\n:alert(1)']) {
    assert.equal(hrefSeguro(u), null, `deixou passar: ${JSON.stringify(u)}`);
  }
});

test('link com esquema recusado vira TEXTO, e o texto continua visível', () => {
  const [p] = analisaMarkdown('clique [aqui](javascript:alert(1))');

  assert.equal(p.filhos.some((f) => f.t === 'link'), false, 'gerou link perigoso');
  assert.match(paraTextoSimples([p]), /aqui/);
});

test('esquema recusado nunca chega a um atributo href do DOM', () => {
  const frag = monta('[x](javascript:alert(1)) e [y](data:text/html,a)');

  assert.deepEqual(achaTags(frag, 'a'), []);
});

test('HTML no texto de origem é conteúdo, não estrutura', () => {
  const frag = monta('<img src=x onerror=alert(1)> e <b>oi</b>');

  assert.deepEqual(achaTags(frag, 'img'), []);
  assert.deepEqual(achaTags(frag, 'b'), []);
  assert.match(frag.textContent, /<img src=x onerror=alert\(1\)>/);
});

test('nem o rótulo do link escapa para estrutura', () => {
  const frag = monta('[<script>alert(1)</script>](https://a.org)');

  assert.deepEqual(achaTags(frag, 'script'), []);
  assert.equal(achaTags(frag, 'a')[0].textContent, '<script>alert(1)</script>');
});

test('link externo sai com rel e target seguros', () => {
  const [a] = achaTags(monta('[v](https://a.org/x)'), 'a');

  assert.equal(a.atributos.href, 'https://a.org/x');
  assert.equal(a.atributos.target, '_blank');
  assert.match(a.atributos.rel, /noopener/);
  assert.match(a.atributos.rel, /noreferrer/);
});

test('link interno não abre em nova aba', () => {
  const [a] = achaTags(monta('[v](/acervo/lula)'), 'a');

  assert.equal(a.atributos.target, undefined);
});

// --------------------------------------------------------------------------
// materialização
// --------------------------------------------------------------------------

test('criaElementos monta a estrutura esperada do formato "Candidatos"', () => {
  const frag = monta([
    'Nenhum dos dois registrou proposta sobre o tema.',
    '',
    '## O que há',
    '',
    '- **A:** disse X [S1]',
    '- **B:** disse Y [S2]',
    '',
    '---',
    '',
    '## Lacunas',
    '',
    '- Nada registrado para C.',
  ].join('\n'));

  assert.equal(achaTags(frag, 'p').length, 1);
  assert.equal(achaTags(frag, 'h2').length, 2);
  assert.equal(achaTags(frag, 'ul').length, 2);
  assert.equal(achaTags(frag, 'li').length, 3);
  assert.equal(achaTags(frag, 'hr').length, 1);
  assert.equal(achaTags(frag, 'strong').length, 2);
});

test('o marcador vira link para a âncora da fonte, em sup', () => {
  const frag = monta('afirmou isso [S3]');
  const [sup] = achaTags(frag, 'sup');
  const [a] = achaTags(sup, 'a');

  assert.equal(a.atributos.href, '#fonte-3');
  assert.equal(a.textContent, '[S3]');
});

test('marcador aceita uma âncora com outro prefixo', () => {
  const frag = criaElementos(analisaMarkdown('x [S2]'), domFalso(), { ancora: (n) => `#c${n}` });

  assert.equal(achaTags(frag, 'a')[0].atributos.href, '#c2');
});

// --------------------------------------------------------------------------
// texto simples (base do compartilhamento)
// --------------------------------------------------------------------------

test('paraTextoSimples remove marcação e preserva a leitura', () => {
  const md = '## Conclusão\n\nNenhum **registrou** proposta.\n\n- item [S1]\n- outro\n';

  assert.equal(paraTextoSimples(analisaMarkdown(md)),
    'Conclusão\n\nNenhum registrou proposta.\n\n• item [S1]\n• outro');
});

test('paraTextoSimples mantém o endereço quando o link tem rótulo diferente', () => {
  const t = paraTextoSimples(analisaMarkdown('veja [o vídeo](https://a.org/v)'));

  assert.equal(t, 'veja o vídeo (https://a.org/v)');
});

test('paraTextoSimples não repete o endereço quando ele é o próprio rótulo', () => {
  const t = paraTextoSimples(analisaMarkdown('https://a.org/v'));

  assert.equal(t, 'https://a.org/v');
});
