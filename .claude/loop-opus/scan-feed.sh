#!/bin/bash
# Обход свежих роликов ленты проверкой вёрстки колофона.
#
# Смысл: код может быть верным, а артефакт кривым — так уже было 24.08.2026,
# когда сервис перезапустился на устаревшем образе. Единственный способ это
# поймать — смотреть на сами mp4.
#
#   ./scan-feed.sh [сколько]   (по умолчанию 5 свежих)
#
# Выход 0 — все проверенные в порядке. 1 — есть подозрительные.
# Печатает знаменатель: сколько осмотрено, сколько пропущено и почему.
# Молчаливый «всё хорошо» при нуле осмотренных недопустим.

set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
N="${1:-5}"
BASE="https://vibee-render-production.up.railway.app"
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT

curl -s -m 40 "$BASE/api/feed?page=0&limit=30&sort=recent" -o "$TMP/feed.json" || {
  echo "НЕ ИЗМЕРЕНО: лента недоступна"; exit 2; }

# Берём только TrinityBlogReel — у других композиций колофона нет вовсе,
# и проверять их этим детектором бессмысленно (дал бы ложные срабатывания).
node -e '
const fs=require("fs");
const d=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
const n=Number(process.argv[2]);
const out=[];
for (const t of d.templates) {
  let s={}; try{s=JSON.parse(t.templateSettings)}catch(e){continue}
  if (s.compositionId!=="TrinityBlogReel") continue;
  if (!(s.props||{}).invariant) continue;   // короткая лента не переносится, детектор к ней не применим
  out.push([t.id,t.videoUrl,(t.name||"").slice(0,38)].join("\t"));
  if (out.length>=n) break;
}
console.log(out.join("\n"));
' "$TMP/feed.json" "$N" > "$TMP/list.tsv"

TOTAL=0; BAD=0; SKIP=0
while IFS=$'\t' read -r id url name; do
  [ -z "${url:-}" ] && continue
  TOTAL=$((TOTAL+1))
  if ! curl -s -m 180 -o "$TMP/v.mp4" "$url"; then
    echo "  ПРОПУСК  $name — не скачался"; SKIP=$((SKIP+1)); continue
  fi
  OUT=$("$DIR/check-colophon.sh" "$TMP/v.mp4" 2>&1); RC=$?
  case $RC in
    0) echo "  ok       [$id] $name" ;;
    1) echo "  КРИВОЙ   [$id] $name"; echo "           $(echo "$OUT" | head -1)"; BAD=$((BAD+1)) ;;
    *) echo "  ПРОПУСК  [$id] $name — не измерено"; SKIP=$((SKIP+1)) ;;
  esac
done < "$TMP/list.tsv"

echo "осмотрено: $TOTAL · кривых: $BAD · пропущено: $SKIP"
if [ "$TOTAL" -eq 0 ]; then
  echo "НЕ ИЗМЕРЕНО: ни одного ролика не осмотрено — вывод недействителен"
  exit 2
fi
[ "$BAD" -gt 0 ] && exit 1
exit 0
