import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RELEASE_FONTES, VOCABULARIO, fraseCandidato, notaCard, situacaoFontes } from '../src/lib/fontes-declaradas.mjs';
import { todasCandidaturas } from '../src/lib/candidaturas-uf.mjs';

test('o arquivo cobre toda candidatura a governador do snapshot, pela chave do TSE', () => {
  const gov = todasCandidaturas().filter((c) => c.cargo === 'governador');
  const sem = gov.filter((c) => !situacaoFontes(c.id)).map((c) => `${c.uf} ${c.nome}`);
  assert.deepEqual(sem, [], 'governadores sem situação de fontes');
  assert.match(RELEASE_FONTES, /^rel_2026-/);
  assert.deepEqual(VOCABULARIO.length, 5);
});

test('card: uma linha por causa, nenhuma quando há material', () => {
  assert.equal(notaCard({ situacao_fontes: 'com_material' }), '');
  assert.equal(notaCard(null), '');
  assert.equal(notaCard({ situacao_fontes: 'sem_fonte_declarada' }), 'Não informou site nem redes sociais ao TSE');
  assert.equal(notaCard({ situacao_fontes: 'so_canal_de_partido' }), 'Informou ao TSE só canais do partido');
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
  assert.match(fraseCandidato({ situacao_fontes: 'so_canal_de_partido' }), /^Esta candidatura .* dela em nome próprio/);
  assert.equal(fraseCandidato({ situacao_fontes: 'com_material' }), '');
});

test('os dois governadores sem fonte declarada na release corrente ganham a nota', () => {
  for (const id of ['130002544411', '250002548080']) {
    assert.equal(notaCard(situacaoFontes(id)), 'Não informou site nem redes sociais ao TSE', id);
  }
});
