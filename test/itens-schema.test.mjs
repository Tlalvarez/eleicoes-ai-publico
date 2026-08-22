/**
 * `data/itens/item.schema.json` é o formato público do item — e sumia sozinho.
 *
 * Ele está linkado em /candidato como "formato de dados público" e não entra
 * em página construída nenhuma (o link aponta para o blob no GitHub). Por isso
 * a perda era silenciosa: o build passava, o gate de catálogo passava, e o que
 * quebrava era um link público que ninguém testa.
 *
 * O que o apagava: o exportador do harness é transacional — a geração inteira
 * nasce num staging e TROCA de lugar com a árvore publicada. O schema era
 * escrito à mão dentro de `data/itens/`, então ia embora com a árvore velha a
 * cada reexportação (o `git status` da Onda 1 acusou `D`).
 *
 * A causa foi corrigida no harness, e o arranjo mudou: o schema passou a ser
 * FONTE em `harness/schemas/item.schema.json` e a ser EMITIDO em toda geração
 * de itens. O caminho público não se moveu — o `$id` e o link de /candidato
 * continuam valendo —, mas o arquivo daqui é agora DERIVADO.
 *
 * Consequência para quem edita: editar este arquivo no repositório público não
 * adianta, a exportação seguinte o substitui. A edição é em
 * `harness/schemas/item.schema.json`.
 *
 * Este teste continua sendo a rede do lado público: ele não vê o harness, mas
 * vê o resultado. Schema ausente aqui significa exportação que não emitiu o
 * documento — o defeito de volta, por outro caminho.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJETO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RELATIVO = 'data/itens/item.schema.json';
const SCHEMA = join(PROJETO, RELATIVO);

test('o schema público do item continua no repositório', () => {
  assert.ok(existsSync(SCHEMA),
    `${RELATIVO} sumiu. Ele é emitido pelo exportador de itens do harness `
    + '(fonte: harness/schemas/item.schema.json); ausência aqui é exportação '
    + 'que não o emitiu, ou geração publicada sem ele.');
});

test('o schema é JSON válido e descreve um item', () => {
  const schema = JSON.parse(readFileSync(SCHEMA, 'utf8'));

  assert.equal(typeof schema, 'object');
  const texto = JSON.stringify(schema);
  for (const campo of ['data', 'tipo', 'voz', 'url']) {
    assert.match(texto, new RegExp(`"${campo}"`),
      `o schema não menciona o campo '${campo}'`);
  }
});

test('o $id do schema aponta para o caminho em que ele está publicado', () => {
  const { $id } = JSON.parse(readFileSync(SCHEMA, 'utf8'));

  assert.ok($id, 'o schema perdeu o $id');
  assert.ok($id.endsWith(RELATIVO),
    `o $id (${$id}) não termina em ${RELATIVO}: ou o documento mudou de lugar `
    + 'sem o $id acompanhar, ou o link "formato de dados público" de '
    + '/candidato passou a apontar para outro caminho');
});
