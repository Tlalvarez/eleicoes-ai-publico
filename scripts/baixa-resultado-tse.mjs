#!/usr/bin/env node
/**
 * Baixa o resultado oficial de um turno no TSE e grava data/resultado/turno-<n>.json.
 *
 * O build do site não acessa a rede: o resultado entra como dado versionado, como
 * data/comparacao/, e este script é o único caminho até ele. Roda à mão, depois da
 * divulgação (05/10/2026: primeiro turno). O que o site faz com ele está em
 * src/lib/resultado.mjs.
 *
 * De onde vem cada coisa — nada de código de eleição escrito aqui:
 *   · a eleição e o código do cargo: a configuração pública do TSE
 *     (resultados.tse.jus.br/oficial/comum/config/ele-c.json), pelo ano, pelo turno e pelo
 *     NOME do cargo;
 *   · votos e situação (Eleito, 2º turno, Não eleito): o arquivo de resultado do cargo em
 *     cada abrangência (…/dados/<uf>/<uf>-c<cargo>-e<eleição>-u.json);
 *   · o gênero de quem foi eleito ou vai ao segundo turno, para a marca dizer "eleito" ou
 *     "eleita": o registro da candidatura no DivulgaCandContas. Esse serviço recusa esta
 *     máquina (403); com NATIVEPORT_API_KEY no ambiente, a consulta passa pelo gateway.
 *
 * Falha alto: situação que o site não conhece, arquivo que falta, eleito sem gênero.
 *
 * Uso: NATIVEPORT_API_KEY=… node scripts/baixa-resultado-tse.mjs [--ano 2026] [--turno 1]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { UFS } from '../src/lib/cargos.mjs';
import { CONTRATO_RESULTADO, normalizaSituacao } from '../src/lib/resultado.mjs';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OFICIAL = 'https://resultados.tse.jus.br/oficial';
const PAGINA_PUBLICA = 'https://resultados.tse.jus.br/oficial/app/index.html';
const DIVULGA = 'https://divulgacandcontas.tse.jus.br/divulga/rest/v1';
const GATEWAY = 'https://api.nativeport.ai/zenrows';

const arg = (nome, padrao) => {
  const i = process.argv.indexOf(`--${nome}`);
  return i > 0 ? process.argv[i + 1] : padrao;
};
const ANO = Number(arg('ano', 2026));
const TURNO = Number(arg('turno', 1));
const CHAVE = process.env.NATIVEPORT_API_KEY || '';
// o id da eleição no DivulgaCandContas é o mesmo que o site já usa para retratos e links
const ID_DIVULGA = JSON.parse(readFileSync(join(RAIZ, 'src', 'data', 'candidaturas-tse.json'), 'utf8')).eleicao.id_eleicao;

const CARGOS = [
  { slug: 'presidente', nome: 'Presidente', porUf: false },
  { slug: 'governador', nome: 'Governador', porUf: true },
];

async function json(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.json();
}

/** A eleição do turno que tem o cargo, pela configuração pública do TSE. */
function eleicaoDoCargo(config, nomeCargo) {
  for (const pl of config.pl) {
    if (pl.c !== `ele${ANO}`) continue;
    for (const e of pl.e) {
      if (e.t !== String(TURNO)) continue;
      for (const a of e.abr) {
        const cp = (a.cp ?? []).find((c) => c.ds === nomeCargo);
        if (cp) return { cd: e.cd, cargo: cp.cd, nome: e.nm, abrangencias: e.abr.map((x) => x.cd) };
      }
    }
  }
  return null;
}

/** O gênero no registro da candidatura: direto, e pelo gateway quando o TSE recusa. */
async function genero(uf, id) {
  const url = `${DIVULGA}/candidatura/buscar/${ANO}/${uf.toUpperCase()}/${ID_DIVULGA}/candidato/${id}`;
  const tentativas = [() => fetch(url)];
  if (CHAVE) tentativas.push(() => fetch(`${GATEWAY}?${new URLSearchParams({ url })}`, { headers: { Authorization: `Bearer ${CHAVE}` } }));
  for (const tenta of tentativas) {
    for (let i = 0; i < 3; i += 1) {
      try {
        const r = await tenta();
        if (r.ok) {
          // o registro escreve "MASC." e "FEM."; do registro só sai isto (o resto é dado pessoal)
          const sexo = String((await r.json()).descricaoSexo ?? '').toLowerCase();
          if (sexo.startsWith('fem')) return 'feminino';
          if (sexo.startsWith('masc')) return 'masculino';
        }
        if (r.status === 403) break;          // a borda recusa esta máquina: próxima tentativa
      } catch { /* a borda do TSE oscila: tenta de novo */ }
      await new Promise((ok) => setTimeout(ok, 2000));
    }
  }
  return null;
}

async function escopo(eleicao, abr) {
  const pad = (s, n) => String(s).padStart(n, '0');
  const fonte = `${OFICIAL}/ele${ANO}/${eleicao.cd}/dados/${abr}/${abr}-c${pad(eleicao.cargo, 4)}-e${pad(eleicao.cd, 6)}-u.json`;
  const d = await json(fonte);
  const candidatos = d.carg.flatMap((c) => c.agr.flatMap((a) => a.par.flatMap((p) => p.cand.map((k) => ({
    numero: String(k.n),
    nome_urna: k.nmu,
    partido: p.sg,
    situacao: normalizaSituacao(k.st),
    situacao_tse: k.st,
    votos: Number(k.vap),
    pct_validos: k.pvap,
    id_candidatura: k.sqcand,
  })))));
  candidatos.sort((a, b) => b.votos - a.votos);
  const ufDoRegistro = abr === 'br' ? 'BR' : abr;
  for (const c of candidatos.filter((x) => x.situacao === 'eleito' || x.situacao === 'segundo_turno')) {
    c.genero = await genero(ufDoRegistro, c.id_candidatura);
    if (!c.genero) throw new Error(`${abr}: sem o gênero de ${c.nome_urna} no DivulgaCandContas${CHAVE ? '' : ' (rode com NATIVEPORT_API_KEY: o TSE recusa esta máquina)'}`);
  }
  return {
    fonte,
    eleicao: eleicao.nome,
    divulgado_em: `${d.dg} ${d.hg}`,
    totalizacao_final: d.tf === 's',
    secoes_totalizadas_pct: d.s?.pst ?? null,
    candidatos,
  };
}

const config = await json(`${OFICIAL}/comum/config/ele-c.json`);
const saida = {
  contrato: CONTRATO_RESULTADO,
  _: 'Resultado oficial da eleição, por escopo, como o TSE divulga em resultados.tse.jus.br. Gravado por scripts/baixa-resultado-tse.mjs; o gênero de quem foi eleito ou vai ao segundo turno é o do registro da candidatura no DivulgaCandContas.',
  ano: ANO,
  turno: TURNO,
  baixado_em: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
  pagina_publica: PAGINA_PUBLICA,
};
for (const cargo of CARGOS) {
  const eleicao = eleicaoDoCargo(config, cargo.nome);
  if (!eleicao) throw new Error(`ele${ANO}, turno ${TURNO}: nenhuma eleição com o cargo ${cargo.nome} na configuração do TSE`);
  if (!cargo.porUf) {
    saida[cargo.slug] = await escopo(eleicao, 'br');
    continue;
  }
  // abrangência 'br' num cargo por UF quer dizer as 27; no segundo turno, o TSE lista só as que têm
  const ufs = eleicao.abrangencias.includes('br') ? UFS.map((u) => u.sigla.toLowerCase()) : eleicao.abrangencias;
  saida[cargo.slug] = {};
  for (const uf of ufs) saida[cargo.slug][uf] = await escopo(eleicao, uf);
}

const pasta = join(RAIZ, 'data', 'resultado');
mkdirSync(pasta, { recursive: true });
const arquivo = join(pasta, `turno-${TURNO}.json`);
writeFileSync(arquivo, `${JSON.stringify(saida, null, 1)}\n`);

const linha = (rotulo, e) => {
  const decididos = e.candidatos.filter((c) => c.situacao === 'eleito' || c.situacao === 'segundo_turno');
  const estado = e.totalizacao_final ? 'totalizado' : `${e.secoes_totalizadas_pct}% das seções`;
  return `${rotulo.padEnd(10)} ${estado.padEnd(18)} ${decididos.map((c) => `${c.nome_urna} (${c.situacao_tse}, ${c.pct_validos}%)`).join(' · ') || 'sem definição'}`;
};
console.log(linha('presidente', saida.presidente));
for (const [uf, e] of Object.entries(saida.governador)) console.log(linha(`gov/${uf}`, e));
console.log(`\n${arquivo.replace(`${RAIZ}/`, '')}: turno ${TURNO}, ${1 + Object.keys(saida.governador).length} escopos`);
