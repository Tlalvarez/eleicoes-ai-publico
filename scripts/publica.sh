#!/usr/bin/env bash
# O único caminho para produção. `npm run publica` — ou `npm run previa` para ver um
# ramo em <ramo>.eleicoes-ai.pages.dev sem tocar no site.
#
# Por que existe: até 18/09/2026 o deploy era `wrangler pages deploy` direto, e o
# README avisava que ele "NÃO roda portão nenhum". Com gente usando o site, o portão
# deixa de ser lembrança e vira parte do comando. Cada passo cobre algo que já deu
# errado aqui:
#   1. árvore limpa, no main, igual ao origin — o que vai ao ar é um commit, não um
#      estado da máquina;
#   2. `npm test` (suíte, build real e portões do dist) e, SE os dados da comparação
#      mudaram desde a última publicação, os dois portões editoriais do harness;
#   3. publica;
#   4. confere o que a BORDA entrega, não o arquivo: a CSP ficou fora do ar sem
#      ninguém ver porque o portão lia o dist, e a Pages descartava o cabeçalho;
#   5. uma linha em PUBLICACOES.md — o que estava no ar em cada dia é pergunta que a
#      seção Correções vai fazer.
#
# Decide sempre pelo código de saída do próprio comando, nunca por grep na saída.
set -uo pipefail

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RAIZ"
PROJETO="eleicoes-ai"
SITE="https://eleicoes.ai"
HARNESS="${HARNESS:-$RAIZ/..}"
PESQUISAS_TSE="${PESQUISAS_TSE:-$HOME/Downloads/pesquisa_eleitoral_2026}"
CHAVE="${CLOUDFLARE_PAGES_TOKEN_FILE:-$HOME/Keys/cloudflare-pages.token}"
MODO="producao"; [ "${1:-}" = "--previa" ] && MODO="previa"

para() { echo "PAROU: $*" >&2; exit 1; }
passo() { printf '\n== %s\n' "$*"; }

[ -r "$CHAVE" ] || para "não achei a credencial da Pages em $CHAVE"
RAMO="$(git rev-parse --abbrev-ref HEAD)"
SHA="$(git rev-parse --short HEAD)"
[ -z "$(git status --porcelain)" ] || para "a árvore tem mudança sem commit — o que vai ao ar tem de ser um commit"

if [ "$MODO" = "producao" ]; then
  [ "$RAMO" = "main" ] || para "produção sai do main; você está em '$RAMO' (use \`npm run previa\` para ver este ramo)"
  git fetch -q origin main || para "não consegui consultar o origin"
  [ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] || para "main local ≠ origin/main — faça o push (ou o pull) antes"
fi

# ---------------------------------------------------------------- portões
passo "npm test"
npm test > .publica-teste.log 2>&1; s=$?
[ $s -eq 0 ] || { tail -25 .publica-teste.log >&2; para "npm test falhou (saída $s) — log inteiro em .publica-teste.log"; }
echo "ok"

if [ "$MODO" = "producao" ]; then
  ULTIMO="$(grep -oE '^\| [0-9-]+ [0-9:]+ \| [0-9a-f]{7,}' PUBLICACOES.md 2>/dev/null | tail -1 | awk '{print $NF}')"
  if [ -n "$ULTIMO" ] && git cat-file -e "$ULTIMO^{commit}" 2>/dev/null; then
    MUDOU="$(git diff --name-only "$ULTIMO" HEAD -- data/comparacao)"
  else
    MUDOU="(sem publicação anterior registrada: confere tudo)"
  fi
  if [ -n "$MUDOU" ]; then
    passo "os dados da comparação mudaram: portões editoriais"
    [ -f "$HARNESS/v3/audita_metodologia.py" ] || para "os dados mudaram e o harness não está em $HARNESS (defina HARNESS=…)"
    [ -d "$PESQUISAS_TSE" ] || para "os dados mudaram e o cadastro de pesquisas do TSE não está em $PESQUISAS_TSE (defina PESQUISAS_TSE=…)"
    if [ -n "$ULTIMO" ]; then
      ESCOPOS="$(echo "$MUDOU" | sed -nE 's#^data/comparacao/presidente/.*#6#p; s#^data/comparacao/governador/([a-z]{2})/.*#\1#p' | sort -u | paste -sd, -)"
    fi
    ESCOPOS="${ESCOPOS:-6,rj}"
    python3 "$HARNESS/v3/audita_metodologia.py" --escopos "$ESCOPOS"; s=$?
    [ $s -eq 0 ] || para "audita_metodologia reprovou (saída $s)"
    python3 "$HARNESS/v3/confere_pesquisas.py" --dados "$PESQUISAS_TSE" --criterio data/comparacao/criterio.json; s=$?
    [ $s -eq 0 ] || para "confere_pesquisas reprovou (saída $s)"
  fi
fi

# o commit que está no ar fica legível no próprio site
printf '{"sha":"%s","ramo":"%s","quando":"%s"}\n' "$SHA" "$RAMO" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > dist/versao.json

# ---------------------------------------------------------------- publica
DESTINO="main"; [ "$MODO" = "previa" ] && DESTINO="$RAMO"
passo "publicando $SHA em '$DESTINO'"
CLOUDFLARE_API_TOKEN="$(cat "$CHAVE")" npx wrangler pages deploy dist \
  --project-name="$PROJETO" --branch="$DESTINO" --commit-hash="$(git rev-parse HEAD)" \
  --commit-message="$(git log -1 --format=%s)" > .publica-deploy.log 2>&1; s=$?
[ $s -eq 0 ] || { tail -15 .publica-deploy.log >&2; para "o deploy falhou (saída $s)"; }
grep -oE 'https://[a-z0-9.-]+\.pages\.dev' .publica-deploy.log | tail -2

if [ "$MODO" = "previa" ]; then
  echo; echo "Prévia no ar (a medição não carrega fora de eleicoes.ai). Nada mudou em produção."
  exit 0
fi

# ---------------------------------------------------------------- confere a borda
passo "conferindo o que $SITE entrega"
falhas=0
no_ar=""
for i in $(seq 1 12); do
  no_ar="$(curl -fsS "$SITE/versao.json?$(date +%s)" 2>/dev/null | sed -nE 's/.*"sha":"([0-9a-f]+)".*/\1/p')"
  [ "$no_ar" = "$SHA" ] && break
  sleep 5
done
[ "$no_ar" = "$SHA" ] && echo "ok  versão no ar = $SHA" || { echo "FALHA  versão no ar = '${no_ar:-?}', esperada $SHA"; falhas=$((falhas+1)); }

confere() { # caminho, trecho que o corpo tem de trazer
  corpo="$(curl -fsS "$SITE$1" 2>/dev/null)"; s=$?
  if [ $s -eq 0 ] && printf '%s' "$corpo" | grep -q -- "$2"; then echo "ok  $1"; else echo "FALHA  $1 (curl=$s, ou sem '$2')"; falhas=$((falhas+1)); fi
}
confere "/" 'class="comparacao'
confere "/presidente/educacao" 'class="comparacao'
confere "/governador/sp" 'class="comparacao'
confere "/robots.txt" 'Sitemap: '
confere "/sitemap.xml" '<urlset'
for h in strict-transport-security x-frame-options; do
  curl -fsSI "$SITE/" | grep -qi "^$h:" && echo "ok  cabeçalho $h" || { echo "FALHA  cabeçalho $h não chega"; falhas=$((falhas+1)); }
done
curl -fsSI "$SITE/" | grep -qi '^content-security-policy:' && echo "ok  cabeçalho content-security-policy" \
  || echo "aviso  content-security-policy não chega ao navegador (M4 do backlog, conhecido)"

RESULTADO="ok"; [ $falhas -eq 0 ] || RESULTADO="$falhas falha(s) na conferência"
[ -f PUBLICACOES.md ] || printf '# Publicações\n\nUma linha por publicação em produção, escrita por `scripts/publica.sh`.\n\n| quando (UTC) | commit | o que mudou | conferência no ar |\n|---|---|---|---|\n' > PUBLICACOES.md
printf '| %s | %s | %s | %s |\n' "$(date -u '+%Y-%m-%d %H:%M')" "$SHA" "$(git log -1 --format=%s | tr '|' '/')" "$RESULTADO" >> PUBLICACOES.md
git add PUBLICACOES.md && git commit -q -m "publicação: $SHA no ar ($RESULTADO)" && git push -q origin main

if [ $falhas -ne 0 ]; then
  echo; echo "NO AR, MAS COM $falhas FALHA(S). Para voltar ao estado anterior:"
  echo "  git revert --no-edit $SHA && git push && npm run publica"
  echo "  (ou, mais rápido: painel da Cloudflare → Pages → $PROJETO → Deployments → Rollback no anterior)"
  exit 1
fi
echo; echo "Publicado e conferido: $SHA"
