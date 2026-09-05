import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

/**
 * Decisão (05/09/2026): o site NÃO expõe o texto dos itens do acervo — nem o
 * campo `texto`, nem transcrição, nem os arquivos do bundle da release. A
 * release v2 carrega texto integral (política `full`); ele serve ao serviço
 * de evidências, não a uma página onde alguém consulte ou baixe textos em
 * massa. Cards com título, data e link continuam.
 */
const ROOT = fileURLToPath(new URL('..', import.meta.url));

function arquivos(dir) {
  const saida = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) saida.push(...arquivos(p)); else saida.push(p);
  }
  return saida;
}

const paginasAcervo = arquivos(join(ROOT, 'src/pages/acervo')).filter((p) => p.endsWith('.astro'));
const paginasCandidato = arquivos(join(ROOT, 'src/pages/candidato')).filter((p) => p.endsWith('.astro'));

test('nenhuma página do acervo ou de candidato renderiza o texto de um item', () => {
  for (const p of [...paginasAcervo, ...paginasCandidato]) {
    const fonte = readFileSync(p, 'utf8');
    assert.doesNotMatch(fonte, /\b\w+\.texto\b/, `${p} lê o campo texto de um item`);
    assert.doesNotMatch(fonte, /\.transcricao\b/, `${p} renderiza transcrição`);
  }
});

test('a página de transcrição por item não existe mais', () => {
  assert.ok(!existsSync(join(ROOT, 'src/pages/acervo/[slug]/item')));
});

test('o site não referencia os arquivos do bundle da release', () => {
  for (const p of arquivos(join(ROOT, 'src'))) {
    const fonte = readFileSync(p, 'utf8');
    assert.ok(!/acervo\.sqlite|itens\.jsonl/.test(fonte), `${p} referencia o bundle da release`);
  }
  assert.ok(!existsSync(join(ROOT, 'public/data')), 'public/data exporia dados ao dist');
});
