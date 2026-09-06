import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RELEASE_FONTES, VOCABULARIO, dataBr, fraseCandidato, notaCard, notaColeta, situacaoFontes } from '../src/lib/fontes-declaradas.mjs';
import { todasCandidaturas } from '../src/lib/candidaturas-uf.mjs';

test('o arquivo cobre toda candidatura a governador do snapshot, pela chave do TSE', () => {
  const gov = todasCandidaturas().filter((c) => c.cargo === 'governador');
  const sem = gov.filter((c) => !situacaoFontes(c.id)).map((c) => `${c.uf} ${c.nome}`);
  assert.deepEqual(sem, [], 'governadores sem situação de fontes');
  assert.match(RELEASE_FONTES, /^rel_2026-/);
  assert.equal(VOCABULARIO.length, 7);
});

test('card: uma linha por causa, nenhuma quando há material', () => {
  assert.equal(notaCard({ situacao_fontes: 'com_material' }), '');
  assert.equal(notaCard(null), '');
  assert.equal(notaCard({ situacao_fontes: 'sem_fonte_declarada' }), 'Não informou site nem redes sociais ao TSE');
  // a causa do canal do partido é separada por ORIGEM: dizer que o candidato
  // "informou" quando fomos nós que anexamos é falsidade sobre pessoa nomeada
  assert.equal(notaCard({ situacao_fontes: 'so_canal_de_partido_declarado' }),
    'Informou ao TSE só o canal do partido');
  assert.equal(notaCard({ situacao_fontes: 'so_canal_de_partido_anexado' }),
    'Não há material próprio; o que temos é do canal do partido');
  assert.equal(notaCard({ situacao_fontes: 'sem_material_coletado' }), 'Ainda não coletamos material');
  assert.equal(notaCard({ situacao_fontes: 'so_fontes_sem_lane', outras_declaradas: ['facebook', 'kwai'] }),
    'Informou ao TSE só Facebook e Kwai, que ainda não coletamos');
  assert.equal(notaCard({ situacao_fontes: 'so_fontes_sem_lane', outras_declaradas: ['instagram-url-invalida'] }),
    'Informou ao TSE só endereços que ainda não coletamos');
});

test('página do candidato: frase inteira, neutra (o TSE não traz gênero), sem prometer o que a IA vai dizer', () => {
  const f = fraseCandidato({ situacao_fontes: 'sem_fonte_declarada' });
  assert.equal(f, 'Esta candidatura não informou ao TSE nenhum site ou rede social própria. Por isso o acervo não tem material dela.');
  assert.doesNotMatch(f, /a IA vai dizer|Este candidato|dele\b/);
  assert.match(fraseCandidato({ situacao_fontes: 'so_canal_de_partido_declarado' }), /^Esta candidatura informou ao TSE apenas um canal do partido/);
  assert.match(fraseCandidato({ situacao_fontes: 'so_canal_de_partido_anexado' }), /^Não há material próprio desta candidatura/);
  assert.equal(fraseCandidato({ situacao_fontes: 'com_material' }), '');
});

test('quem não informou fonte ao TSE ganha a nota; quem passou a ter material perde', () => {
  // Policial Edjane (gov/SP) não declarou nada ao TSE: a nota é dela e continua.
  assert.equal(notaCard(situacaoFontes('250002548080')), 'Não informou site nem redes sociais ao TSE');
  // Ben Mendes (gov/MG) estava sem material; na rel_2026-09-06_01 o plano dele
  // foi importado (era um dos 4 ausentes), então o card não acusa mais lacuna.
  assert.equal(notaCard(situacaoFontes('130002544411')), '');
  assert.equal(situacaoFontes('130002544411').situacao_fontes, 'com_material');
});

test('coleta: o card diz quando as fontes foram vistas; sem data, não diz nada', () => {
  assert.equal(dataBr('2026-09-05'), '05/09/2026');
  assert.equal(dataBr(null), '');
  assert.equal(notaColeta({ ultima_coleta_em: '2026-09-05' }), 'Fontes vistas em 05/09/2026');
  assert.equal(notaColeta({ ultima_coleta_em: null }), '');
  assert.equal(notaColeta(null), '');
  // quem tem material tem data de coleta: é o que o leitor pergunta em seguida
  const alan = situacaoFontes('10002532492');
  assert.equal(notaColeta(alan), 'Fontes vistas em 05/09/2026');
});

test('o arquivo separa o canal do partido por origem, e ninguém sobrou no valor antigo', async () => {
  const { readFile } = await import('node:fs/promises');
  const d = JSON.parse(await readFile(new URL('../src/data/fontes-declaradas-2026.json', import.meta.url), 'utf8'));
  assert.equal(d.schema_version, 'fontes-declaradas-2026/4');
  assert.equal(d.resumo.so_canal_de_partido_declarado, 11);
  assert.equal(d.resumo.so_canal_de_partido_anexado, 24);
  assert.equal(d.resumo.so_canal_de_partido, undefined, 'o valor único não pode sobrar no arquivo');
});
