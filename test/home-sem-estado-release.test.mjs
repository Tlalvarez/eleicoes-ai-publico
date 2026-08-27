/**
 * A home não renderiza o quadro de estado de release.
 *
 * O aviso de prévia continua existindo — no componente
 * src/components/EstadoRelease.astro, na página do acervo, no rodapé de cada
 * resposta do chat e nos formatos de compartilhamento. O que sai é apenas o
 * quadro fixo no topo de src/pages/index.astro, que empurrava o chat para
 * baixo repetindo o que a própria resposta já declara.
 *
 * O portão em src/lib/release.mjs e o componente ficam intactos: este teste
 * cobra só a ausência do uso na home.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HOME = fileURLToPath(new URL('../src/pages/index.astro', import.meta.url));
const fonte = readFileSync(HOME, 'utf8');

test('a home não renderiza <EstadoRelease>', () => {
  assert.ok(!/<EstadoRelease[\s/>]/.test(fonte),
    'src/pages/index.astro ainda renderiza <EstadoRelease />');
});

test('a home não importa EstadoRelease (import sem uso)', () => {
  assert.ok(!/import\s+EstadoRelease\s+from/.test(fonte),
    'src/pages/index.astro ainda importa EstadoRelease');
  assert.ok(!/EstadoRelease\.astro/.test(fonte),
    'src/pages/index.astro ainda referencia EstadoRelease.astro');
});
