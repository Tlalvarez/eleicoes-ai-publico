/**
 * Permalink de um resultado: pergunta + resposta + fontes cabem na própria
 * URL, sem servidor.
 *
 * O site é estático e não guarda conversa. Um "link para este resultado" que
 * dependesse de backend seria uma promessa que a arquitetura não paga — e um
 * link que só carregasse a PERGUNTA reabriria uma resposta possivelmente
 * diferente, o que é pior do que não ter link: quem compartilha assina um
 * texto, não um sorteio.
 *
 * O estado vai no FRAGMENTO (`#r=`), não na query: fragmento não é enviado ao
 * servidor, não entra em log de CDN e não vira chave de cache.
 *
 * URL tem limite prático. Aqui ele é explícito: acima dele o permalink
 * simplesmente não é oferecido, e copiar/WhatsApp continuam funcionando com o
 * texto. Gerar uma URL de 40 mil caracteres que quebra ao colar seria pior do
 * que dizer que não cabe.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  LIMITE_CARGA, LIMITE_CONTEUDO, LIMITE_URL, PREFIXO_FRAGMENTO, codifica,
  decodifica, estadoDoFragmento, montaPermalink,
} from '../src/lib/permalink.mjs';
import { ROTULO_PREVIA, estadoDaResposta } from '../src/lib/release.mjs';

const CITACAO = {
  marcadores: [1, 2],
  candidato: 'lula',
  nome: 'Lula',
  rotulo: 'vídeo no YouTube',
  tipo: 'video',
  data: '2026-08-13',
  url: 'https://www.youtube.com/watch?v=Qc__IS3Rxic',
  ts: '00:12:40',
  estatuto: 3,
  estatuto_rotulo: 'legenda automática',
};

const RESULTADO = {
  id: 'r-123',
  pergunta: 'O que os candidatos propõem sobre previdência?',
  texto: '## Conclusão\n\nNenhum registrou proposta específica.\n\n- **A:** nada [S1]\n',
  citacoes: [CITACAO],
  rodape: 'Resposta gerada por IA · 2026-08-25',
  release_id: null,
  release_status: 'previa',
};

// --------------------------------------------------------------------------
// ida e volta
// --------------------------------------------------------------------------

test('o que entra é o que sai: pergunta, resposta e fontes', async () => {
  const volta = await decodifica(await codifica(RESULTADO));

  assert.equal(volta.pergunta, RESULTADO.pergunta);
  assert.equal(volta.texto, RESULTADO.texto);
  assert.deepEqual(volta.citacoes, RESULTADO.citacoes);
  assert.equal(volta.rodape, RESULTADO.rodape);
  assert.equal(volta.id, RESULTADO.id);
  // a declaração de release NÃO viaja: ver 'release forjada no fragmento'
  assert.equal(volta.release_status, null);
});

test('acentuação e emoji sobrevivem à ida e volta', async () => {
  const r = { ...RESULTADO, pergunta: 'Previdência, saúde e educação? 🇧🇷 — 100% já' };

  assert.equal((await decodifica(await codifica(r))).pergunta, r.pergunta);
});

test('resultado sem citações continua válido', async () => {
  const volta = await decodifica(await codifica({ ...RESULTADO, citacoes: [] }));

  assert.deepEqual(volta.citacoes, []);
});

test('citação sem campos opcionais não ganha lixo na volta', async () => {
  const magra = { marcadores: [1], nome: 'X', rotulo: 'post', url: 'https://a.org/1' };
  const volta = await decodifica(await codifica({ ...RESULTADO, citacoes: [magra] }));

  assert.equal(volta.citacoes[0].nome, 'X');
  assert.equal(volta.citacoes[0].url, 'https://a.org/1');
  assert.deepEqual(volta.citacoes[0].marcadores, [1]);
});

// --------------------------------------------------------------------------
// a carga é segura de colar
// --------------------------------------------------------------------------

test('a carga usa só caracteres seguros em URL', async () => {
  const carga = await codifica(RESULTADO);

  assert.match(carga, /^[A-Za-z0-9_-]+$/);
  assert.equal(encodeURIComponent(carga), carga);
});

test('carga inválida devolve null, nunca lança', async () => {
  for (const ruim of ['', 'não-base64!!', 'AAAA', 'x'.repeat(50), null, undefined, 42]) {
    assert.equal(await decodifica(ruim), null, `entrada ${JSON.stringify(ruim)}`);
  }
});

test('carga adulterada no meio devolve null', async () => {
  const carga = await codifica(RESULTADO);
  const meio = Math.floor(carga.length / 2);
  const alterado = carga.slice(0, meio)
    + (carga[meio] === 'A' ? 'B' : 'A') + carga.slice(meio + 1);

  assert.equal(await decodifica(alterado), null);
});

test('versão desconhecida devolve null em vez de adivinhar', async () => {
  const carga = await codifica(RESULTADO);

  assert.equal(await decodifica('9' + carga.slice(1)), null);
});

// --------------------------------------------------------------------------
// tamanho
// --------------------------------------------------------------------------

test('a resposta típica do formato "Candidatos" cabe com folga', async () => {
  const texto = [
    '## Conclusão',
    '',
    'Dos treze acompanhados, dois registraram proposta sobre o tema; os demais não.',
    '',
    '## O que está registrado',
    '',
    ...Array.from({ length: 12 }, (_, i) =>
      `- **Candidato ${i + 1}:** afirmou em evento público que pretende revisar a regra `
      + `de transição, sem detalhar prazo nem fonte de custeio [S${i + 1}]`),
    '',
    '---',
    '',
    '## Lacunas',
    '',
    '- Nenhum registro sobre o tema para os oito candidatos sem coleta ativa.',
  ].join('\n');
  const citacoes = Array.from({ length: 12 }, (_, i) => ({
    ...CITACAO, marcadores: [i + 1], url: `https://www.youtube.com/watch?v=abcdefgh${i}`,
  }));

  const { url, cabe, tamanho } = await montaPermalink(
    'https://eleicoes.ai/', { ...RESULTADO, texto, citacoes });

  assert.equal(cabe, true, `permalink de ${tamanho} caracteres`);
  assert.ok(tamanho < LIMITE_URL, `${tamanho} >= ${LIMITE_URL}`);
  assert.ok(url.includes(PREFIXO_FRAGMENTO));
});

test('o estado vai no fragmento, não na query', async () => {
  const { url } = await montaPermalink('https://eleicoes.ai/', RESULTADO);

  assert.equal(url.split('#')[0], 'https://eleicoes.ai/');
  assert.ok(!url.split('#')[0].includes('='));
});

test('acima do limite não há permalink — e isso é dito, não escondido', async () => {
  // texto de alta entropia: repetição comprime a quase nada e não provaria o
  // caso que interessa, que é o de uma resposta longa e variada de verdade
  let semente = 7;
  const proxima = () => (semente = (semente * 1103515245 + 12345) % 2147483648);
  const enorme = { ...RESULTADO, texto: Array.from({ length: 40000 },
    () => proxima().toString(36)).join(' ') };

  const { url, cabe, tamanho } = await montaPermalink('https://eleicoes.ai/', enorme);

  assert.equal(cabe, false);
  assert.equal(url, null);
  assert.ok(tamanho > LIMITE_URL);
});

test('o limite é parâmetro — quem chama pode ser mais rígido', async () => {
  const { cabe } = await montaPermalink('https://eleicoes.ai/', RESULTADO, { limite: 20 });

  assert.equal(cabe, false);
});

test('a compressão vale a pena em texto repetitivo de verdade', async () => {
  const texto = '- **Candidato:** sem registro sobre o tema [S1]\n'.repeat(200);
  const carga = await codifica({ ...RESULTADO, texto });

  assert.ok(carga.length < texto.length / 4,
    `carga de ${carga.length} para texto de ${texto.length}`);
});

// --------------------------------------------------------------------------
// leitura do fragmento
// --------------------------------------------------------------------------

test('estadoDoFragmento reabre o resultado a partir do location.hash', async () => {
  const { url } = await montaPermalink('https://eleicoes.ai/', RESULTADO);
  const hash = url.slice(url.indexOf('#'));

  const volta = await estadoDoFragmento(hash);

  assert.equal(volta.pergunta, RESULTADO.pergunta);
  assert.deepEqual(volta.citacoes, RESULTADO.citacoes);
});

test('fragmento de âncora comum não é confundido com permalink', async () => {
  for (const h of ['', '#', '#conteudo', '#fonte-3', '#r=', '#r=lixo!!']) {
    assert.equal(await estadoDoFragmento(h), null, `fragmento ${JSON.stringify(h)}`);
  }
});

// --------------------------------------------------------------------------
// carga HOSTIL bem-formada
//
// A soma de verificação é FNV-1a: detecta truncamento, não adulteração. Quem
// fabrica uma carga recalcula a soma sem esforço. Então o teste não altera um
// byte — ele CONSTRÓI a carga do atacante com o próprio codificador e cobra
// que a decodificação, e só ela, seja a defesa.
// --------------------------------------------------------------------------

/** Carga válida (soma correta) a partir de um resultado arbitrário. */
const forja = (bruto) => codifica(bruto);

test('endereço javascript: numa citação não sobrevive à decodificação', async () => {
  for (const veneno of [
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    ' javascript:alert(1)',
    'java\tscript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
  ]) {
    const volta = await decodifica(await forja({
      ...RESULTADO, citacoes: [{ ...CITACAO, url: veneno }],
    }));

    assert.equal(volta.citacoes[0].url, null, `endereço ${JSON.stringify(veneno)} passou`);
  }
});

test('endereço legítimo continua passando', async () => {
  const volta = await decodifica(await forja({
    ...RESULTADO, citacoes: [{ ...CITACAO, url: 'https://exemplo.org/a?b=1#c' }],
  }));

  assert.equal(volta.citacoes[0].url, 'https://exemplo.org/a?b=1#c');
});

test('release forjada no fragmento nunca vira "oficial"', async () => {
  const volta = await decodifica(await forja({
    ...RESULTADO, release_id: 'rel-2026-08-26', release_status: 'oficial',
  }));

  assert.equal(volta.release_status, null);
  assert.equal(volta.release_id, null);
  assert.equal(estadoDaResposta(volta).oficial, false);
  assert.equal(estadoDaResposta(volta).rotulo, ROTULO_PREVIA);
});

test('permalink não carrega declaração de release nem quando ela é verdadeira', async () => {
  // conteúdo reconstruído da URL não tem procedência verificável: mesmo uma
  // release legítima, ao viajar no fragmento, viraria carimbo falsificável
  const carga = await codifica({
    ...RESULTADO, release_id: 'rel-legitima', release_status: 'oficial',
  });
  const volta = await decodifica(carga);

  assert.equal(volta.release_status, null);
  assert.equal(volta.release_id, null);
});

test('a decodificação é a mesma normalização da resposta do serviço', async () => {
  const volta = await decodifica(await forja({
    ...RESULTADO,
    citacoes: [
      { ...CITACAO, marcadores: [] },                       // órfã: sem marcador
      { ...CITACAO, marcadores: ['1', 2.5, -3, 4, 4] },       // marcador inválido/repetido
      { ...CITACAO, marcadores: [2], estatuto: 'oficial' },  // tipo errado
    ],
  }));

  assert.equal(volta.citacoes.length, 2, 'citação sem marcador devia ter sido descartada');
  assert.deepEqual(volta.citacoes[0].marcadores, [1, 4]);
  assert.equal(volta.citacoes[1].estatuto, null);
});

test('campos de tipo errado viram forma conhecida em vez de chegar à interface', async () => {
  const volta = await decodifica(await forja({
    pergunta: { toString: () => 'objeto' },
    texto: 'texto legítimo',
    citacoes: [CITACAO],
  }));

  assert.equal(typeof volta.pergunta, 'string');
  assert.equal(typeof volta.texto, 'string');
});

// --------------------------------------------------------------------------
// limites de tamanho: antes e depois da descompressão
// --------------------------------------------------------------------------

test('carga acima do teto de bytes é recusada sem descomprimir', async () => {
  // alta entropia de propósito: 'aaaa…' comprimiria a nada e o teste passaria
  // pelo motivo errado, sem nunca chegar ao teto que ele diz cobrir
  let semente = 11;
  const proxima = () => (semente = (semente * 1103515245 + 12345) % 2147483648);
  const carga = await codifica({ ...RESULTADO,
    texto: Array.from({ length: 40000 }, () => proxima().toString(36)).join(' ') });

  // a carga em si é grande demais: nem chega a virar objeto
  assert.ok(carga.length > LIMITE_CARGA, `carga de ${carga.length}`);
  assert.equal(await decodifica(carga), null);
});

test('bomba de descompressão é recusada pelo teto do conteúdo', async () => {
  // repetição comprime a quase nada: a carga cabe, o conteúdo não
  const bomba = await codifica({ ...RESULTADO, texto: 'a'.repeat(LIMITE_CONTEUDO * 4) });

  assert.ok(bomba.length < LIMITE_CARGA, `carga de ${bomba.length} devia caber`);
  assert.equal(await decodifica(bomba), null);
});

test('excesso de citações é recusado', async () => {
  const muitas = Array.from({ length: 400 }, (_, i) => ({ ...CITACAO, marcadores: [i + 1] }));

  assert.equal(await decodifica(await codifica({ ...RESULTADO, citacoes: muitas })), null);
});

test('o teto não estorva a resposta real: 40 fontes continuam passando', async () => {
  const citacoes = Array.from({ length: 40 }, (_, i) => ({ ...CITACAO, marcadores: [i + 1] }));
  const volta = await decodifica(await codifica({ ...RESULTADO, citacoes }));

  assert.equal(volta.citacoes.length, 40);
});
