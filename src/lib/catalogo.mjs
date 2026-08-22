/**
 * O catálogo de candidatos publicado, e a igualdade entre as fontes que o
 * declaram.
 *
 * O site tem duas fontes derivadas do mesmo cadastro do harness:
 * `data/itens/resumo.json` (hub, arquivo, menções) e `data/acervo/indice.json`
 * (acervo navegável). Elas são geradas por exportações separadas — e a
 * checagem que existia aceitava qualquer quantidade em cada uma, então um
 * candidato que sumisse de um dos lados passava batido: hub sem acervo, ou
 * acervo sem hub, sem uma linha de erro.
 *
 * Aqui o contrato é igualdade de CONJUNTO e de NOME entre TODAS as fontes,
 * incluindo a AUTORIDADE: `src/data/candidatos.json`, versionado neste
 * repositório e editado à mão.
 *
 * Por que a autoridade não pode ser opcional: `resumo.json` e `indice.json`
 * são dois derivados da MESMA exportação. Comparar um com o outro não diz
 * nada sobre quantos candidatos deveriam estar publicados — uma exportação
 * que perdesse um produziria os dois igualmente errados, e o gate anunciaria
 * "OK: 12 candidatos". A lista esperada era opcional, vinha de uma variável de
 * ambiente, e o gate obrigatório não a definia. Agora ela é obrigatória e vem
 * de arquivo; não há variável que a desligue.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Raiz do projeto, derivada de onde ESTE módulo está (não do cwd). */
const RAIZ_PROJETO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export const CAMINHO_CANONICO = join('src', 'data', 'candidatos.json');

/** {slug: nome} do arquivo canônico, com o contrato cobrado. */
export function catalogoCanonico(dados) {
  const lista = dados?.candidatos;
  if (!Array.isArray(lista) || lista.length === 0) {
    throw new Error(`${CAMINHO_CANONICO}: catálogo canônico vazio ou ausente — `
      + 'catálogo vazio passa em toda comparação de conjunto, e é justamente o '
      + 'estado que não pode ser anunciado como sucesso');
  }
  const catalogo = {};
  for (const c of lista) {
    if (!c?.slug || typeof c.slug !== 'string') {
      throw new Error(`${CAMINHO_CANONICO}: entrada sem 'slug': ${JSON.stringify(c)}`);
    }
    if (!c?.nome || typeof c.nome !== 'string') {
      throw new Error(`${CAMINHO_CANONICO}: '${c.slug}' sem 'nome' — o nome `
        + 'público faz parte do que o gate compara');
    }
    if (c.slug in catalogo) {
      throw new Error(`${CAMINHO_CANONICO}: slug repetido '${c.slug}'`);
    }
    catalogo[c.slug] = c.nome;
  }
  return catalogo;
}

/** Lê e valida o catálogo canônico de uma raiz de projeto. */
export function leCatalogoCanonico(raiz = RAIZ_PROJETO) {
  const caminho = join(resolve(raiz), CAMINHO_CANONICO);
  let bruto;
  try {
    bruto = readFileSync(caminho, 'utf8');
  } catch (e) {
    // FALHA, não "segue sem autoridade": um gate que passa quando a fonte de
    // verdade some não é gate
    throw new Error(`${caminho} não encontrado — é a fonte canônica do `
      + `catálogo e o gate não roda sem ela (${e.code})`);
  }
  return catalogoCanonico(JSON.parse(bruto));
}

/** {slug: nome} do catálogo declarado no manifesto da geração ativa. */
export function catalogoDoManifesto(manifesto) {
  return { ...(manifesto?.catalogo ?? {}) };
}

/** {slug: nome} de data/itens/resumo.json. */
export function catalogoDoResumo(resumo) {
  return Object.fromEntries(
    Object.entries(resumo?.candidatos ?? {}).map(([slug, c]) => [slug, c.nome]));
}

/** {slug: nome} de data/acervo/indice.json. */
export function catalogoDoIndice(indice) {
  return Object.fromEntries(
    Object.entries(indice?.candidatos ?? {}).map(([slug, c]) => [slug, c.nome]));
}

/**
 * Compara os catálogos entre si (e, se dada, com a lista esperada).
 *
 * `fontes` é {rótulo: {slug: nome}} — o rótulo entra na mensagem para que a
 * falha diga QUAL arquivo está fora, não só que algo está.
 */
export function comparaCatalogos(fontes) {
  const rotulos = Object.keys(fontes);
  const falhas = [];

  const vazias = rotulos.filter((r) => Object.keys(fontes[r]).length === 0);
  if (vazias.length) {
    // catálogo vazio passa em toda comparação de conjunto — e é justamente o
    // estado que não pode ser anunciado como sucesso
    falhas.push(`nenhum candidato em ${vazias.join(', ')} — catálogo vazio não `
      + `é catálogo válido`);
    return falhas;
  }

  // A PRIMEIRA fonte é a autoridade — por convenção de quem chama, que põe o
  // canônico versionado na frente. Todas as outras são conferidas contra ela,
  // e não entre si: dois derivados errados do mesmo jeito não podem se
  // validar mutuamente.
  const [base, ...resto] = rotulos;
  for (const outro of resto) {
    for (const slug of Object.keys(fontes[base])) {
      if (!(slug in fontes[outro])) {
        falhas.push(`'${slug}' está em ${base} e falta em ${outro}`);
      } else if (fontes[outro][slug] !== fontes[base][slug]) {
        falhas.push(`'${slug}' tem nome '${fontes[base][slug]}' em ${base} e `
          + `'${fontes[outro][slug]}' em ${outro}`);
      }
    }
    for (const slug of Object.keys(fontes[outro])) {
      if (!(slug in fontes[base])) {
        falhas.push(`'${slug}' está em ${outro} e não é esperado por ${base}`);
      }
    }
  }
  return falhas;
}

/**
 * Os redirecionamentos das URLs antigas de menções, um por candidato.
 *
 * A seção Menções migrou para dentro do hub por candidato em 08/08/2026, e os
 * redirecionamentos estavam digitados um a um em `astro.config.mjs`. Com 13
 * candidatos, os que entrassem depois não teriam redirecionamento e a URL
 * antiga daria 404 sem erro em lugar nenhum — o build não sabe que deveria
 * existir. Derivado do catálogo, candidato novo entra sozinho.
 */
export function redirectsDeMencoes(catalogo) {
  return Object.fromEntries(Object.keys(catalogo).map(
    (slug) => [`/mencoes/${slug}`, `/candidato/${slug}/mencoes`]));
}
