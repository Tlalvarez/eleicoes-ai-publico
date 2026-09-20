/**
 * Avisa o IndexNow (Bing, e daí o ChatGPT) de que endereços mudaram.
 *
 * Por que existe: em 19/09/2026 uma pessoa digitou eleicoes.ai no Claude, ele leu o cartão e, ao ser
 * perguntado sobre o Rio de Janeiro, respondeu que não conseguia abrir a página — o leitor ao vivo do
 * assistente só abre endereço que veio da pessoa ou de uma BUSCA, e o site não estava em busca nenhuma.
 * Estar no índice é o que faz o assistente andar sozinho pelo acervo; enviar endereço à mão não escala,
 * e a cota manual do Bing é de 100 por dia.
 *
 * O protocolo é um POST com a lista de URLs e uma chave que tem de estar publicada em
 * https://eleicoes.ai/<chave>.txt (o arquivo em public/, com a própria chave dentro). Sem esse arquivo o
 * serviço recusa: é assim que ele prova que quem avisa é dono do site.
 *
 * O que se envia: os endereços do sitemap do dist cujo conteúdo mudou desde a publicação anterior, mais a
 * home. Nada de reenviar as 401 páginas a cada publicação — o protocolo pede o que MUDOU.
 *
 * Uso:  node scripts/avisa-indexnow.mjs <commit-anterior>   (sem argumento: só a home)
 * Não derruba a publicação: qualquer erro aqui é aviso, o site já está no ar.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = new URL('..', import.meta.url).pathname;
const SITE = 'https://eleicoes.ai';
const HOST = 'eleicoes.ai';

/** A chave é o nome do arquivo .txt em public/ cujo conteúdo é o próprio nome. */
export function chaveDeIndexNow(pasta = join(RAIZ, 'public')) {
  for (const nome of readdirSync(pasta)) {
    const m = /^([0-9a-f]{8,128})\.txt$/i.exec(nome);
    if (m && readFileSync(join(pasta, nome), 'utf8').trim() === m[1]) return m[1];
  }
  return null;
}

/** Caminho de dado/página → endereço público. `data/comparacao/presidente/saude.json` → /presidente/saude */
export function enderecosDe(arquivos) {
  const fora = new Set();
  for (const f of arquivos) {
    let m;
    if ((m = /^data\/comparacao\/presidente\/([a-z0-9-]+)\.json$/.exec(f))) fora.add(`${SITE}/presidente/${m[1]}`);
    else if ((m = /^data\/comparacao\/governador\/([a-z]{2})\/[a-z0-9-]+\.json$/.exec(f))) fora.add(`${SITE}/governador/${m[1]}`);
    else if ((m = /^src\/pages\/([a-z0-9-]+)\.astro$/.exec(f))) fora.add(m[1] === 'index' ? `${SITE}/` : `${SITE}/${m[1]}`);
    else if (/^(src\/(layouts|components|lib)\/|scripts\/emite-)/.test(f)) fora.add(`${SITE}/`);
  }
  return [...fora];
}

async function principal() {
  const chave = chaveDeIndexNow();
  if (!chave) return console.log('IndexNow: sem chave em public/<chave>.txt — nada enviado');
  const anterior = process.argv[2];
  let mudou = [];
  if (anterior) {
    try {
      mudou = execFileSync('git', ['diff', '--name-only', anterior, 'HEAD'], { cwd: RAIZ, encoding: 'utf8' }).split('\n').filter(Boolean);
    } catch { /* commit some do histórico: manda só a home */ }
  }
  const urls = [...new Set([`${SITE}/`, ...enderecosDe(mudou)])].slice(0, 10000);
  const corpo = { host: HOST, key: chave, keyLocation: `${SITE}/${chave}.txt`, urlList: urls };
  try {
    const r = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(corpo),
    });
    // 200 e 202 são aceite; 422 costuma ser "chave não confere com o host"
    console.log(`IndexNow: ${urls.length} endereço(s) → HTTP ${r.status}${r.status >= 300 ? ` ${(await r.text()).slice(0, 200)}` : ''}`);
  } catch (e) {
    console.log(`IndexNow: não consegui avisar (${e.message}) — o site está no ar do mesmo jeito`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await principal();
