#!/usr/bin/env node
/**
 * As superfícies de dados não chamam os dados de oficiais sem release oficial.
 *
 * Este repositório publica um site cuja tese inteira é proveniência. Nesta
 * branch os dados vêm de uma exportação de trabalho do coletor e de um
 * catálogo preparado à mão: não há manifesto de geração, não há `release_id`,
 * não houve Inspection. Uma linha de interface dizendo "Acervo Oficial" nesse
 * estado não é exagero de marketing — é o site mentindo exatamente onde
 * prometeu não mentir.
 *
 * O portão está em src/lib/release.mjs e só devolve "oficial" com geração,
 * `release_id` e `release_status` declarados. Aqui se confere o outro lado: o
 * HTML construído das superfícies próprias do produto.
 *
 * **Por que só as superfícies próprias.** A primeira versão desta checagem
 * varria o `dist/` inteiro e acusou duas coisas legítimas: um anexo de
 * verificação dizendo que "o acervo oficial do TSE está indisponível no
 * DivulgaCandContas", e um post de candidato, reproduzido literalmente numa
 * página de acervo, que continha a expressão "dados oficiais". Nenhum dos dois
 * é o site afirmando nada — o segundo é conteúdo de terceiro, que o site
 * publica justamente por ser o que foi dito. Um gate que obrigasse a editar
 * material coletado para passar seria pior do que gate nenhum.
 *
 * Quando a release oficial existir, o gate inverte sozinho: passa a proibir o
 * rótulo de prévia nas mesmas superfícies. Não há nada para editar aqui no dia
 * da publicação.
 *
 * Uso: npm run build && npm run test:previa
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { leManifesto } from '../src/lib/dados.mjs';
import { ROTULO_PREVIA, estadoDoSite } from '../src/lib/release.mjs';

const DIST = fileURLToPath(new URL('../dist/', import.meta.url));

/**
 * As superfícies PRÓPRIAS: onde o site fala em nome próprio sobre o acervo.
 *
 * As páginas internas do acervo (`/acervo/<slug>/...`) reproduzem material
 * coletado e ficam de fora por isso — ver o cabeçalho.
 */
const SUPERFICIES = ['index.html', 'acervo.html'];

/**
 * Onde o estado dos dados precisa estar escrito na própria página.
 *
 * Nenhuma superfície fixa declara o estado: os quadros foram removidos por
 * decisão de produto. O estado continua acompanhando cada resposta do chat e
 * seus formatos de compartilhamento. As proibições abaixo seguem valendo para
 * home e acervo.
 */
const DECLARAM_O_ESTADO = [];

/** Afirmações de oficialidade que texto de interface não pode fazer sozinho. */
const AFIRMACOES = [
  [/Acervo\s+Oficial/i, 'chama o material de "Acervo Oficial"'],
  [/dados\s+oficiais/i, 'chama os dados de oficiais'],
  // exige um IDENTIFICADOR (algo com dígito), senão a própria frase que nega
  // a oficialidade — "não têm estatuto de release oficial e…" — casaria
  [/release\s+oficial\s+(?:n[ºo]\.?\s*)?[a-z]*[-_]?\d[\w-]*/i,
    'anuncia um identificador de release oficial'],
];

if (!existsSync(DIST)) {
  console.error('FALHOU (prévia): dist/ não existe — rode `npm run build` antes.');
  process.exit(1);
}

const estado = estadoDoSite(leManifesto());
const falhas = [];

for (const superficie of SUPERFICIES) {
  const caminho = join(DIST, superficie);
  if (!existsSync(caminho)) {
    falhas.push(`${superficie} não foi construída — a superfície sumiu do site`);
    continue;
  }
  const html = readFileSync(caminho, 'utf8');

  if (DECLARAM_O_ESTADO.includes(superficie) && !html.includes(estado.rotulo)) {
    falhas.push(`${superficie}: não declara o estado dos dados ("${estado.rotulo}")`);
  }

  if (estado.oficial) {
    if (html.includes(ROTULO_PREVIA)) {
      falhas.push(`${superficie}: ainda mostra o rótulo de prévia com a release `
        + `${estado.releaseId} publicada`);
    }
  } else {
    for (const [afirmacao, o_que] of AFIRMACOES) {
      if (afirmacao.test(html)) {
        falhas.push(`${superficie}: ${o_que} e não há release oficial declarada — `
          + `${estado.detalhe}`);
      }
    }
  }
}

// O rótulo não pode ser escrito à mão em página nenhuma: se ele existir fora
// do que src/lib/release.mjs produz, alguém contornou o portão.
const fonteDoRotulo = readFileSync(
  fileURLToPath(new URL('../src/lib/release.mjs', import.meta.url)), 'utf8');
if (!fonteDoRotulo.includes(ROTULO_PREVIA)) {
  falhas.push('o rótulo de prévia não está declarado em src/lib/release.mjs');
}
for (const arquivo of ['src/pages/index.astro', 'src/pages/acervo/index.astro',
  'src/components/EstadoRelease.astro']) {
  const texto = readFileSync(fileURLToPath(new URL(`../${arquivo}`, import.meta.url)), 'utf8');
  if (texto.includes(ROTULO_PREVIA)) {
    falhas.push(`${arquivo}: escreve o rótulo de estado à mão — ele tem de vir do `
      + 'portão em src/lib/release.mjs, que é quem sabe se há release');
  }
}

if (falhas.length) {
  console.error('FALHOU (prévia):\n  ' + falhas.join('\n  '));
  process.exit(1);
}
console.log(`OK (prévia): ${SUPERFICIES.join(' e ')} não afirmam oficialidade, não `
  + 'escrevem o rótulo à mão e não exibem quadro fixo de estado');
