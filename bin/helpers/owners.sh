#!/bin/bash
# tri owners — состояние, общее на процесс там, где людей больше одного.
#
# ЗАЧЕМ (форма 29 в скилле blind-guards). Ферма держит ВСЕХ ботов в одном
# процессе, а `ADMIN_IDS` в проде называет пятерых. Модульная переменная в
# таком коде — это «одна на всех»:
#
#   crmProactive: ненажатая карточка ОДНОГО держала всех два часа
#   businessBotService: счётчики дня складывали клиентов разных владельцев,
#                       а /business показывал каждому чужие подключения
#
# Компилятор такого не видит: код верен, пока человек один. Здесь — триаж:
# что объявлено на уровне модуля и есть ли у него ключ. Судит человек, но
# СПИСОК он больше не собирает руками.
set -u
ROOT="${1:?нужен корень репозитория}"
cd "$ROOT" || exit 1

DIRS="src/services src/helpers src/navigation apps/vibee-editor/render/src/agent"
echo "── состояние на уровне модуля ──"
echo

shared=0
keyed=0
for d in $DIRS; do
  [ -d "$d" ] || continue
  while IFS= read -r line; do
    f="${line%%:*}"
    rest="${line#*:}"
    n="${rest%%:*}"
    code="${line#*:*:}"
    case "$code" in
      *"new Map<"*|*"new Map("*)
        keyed=$((keyed + 1))
        printf '  ключ есть  %s:%s\n             %s\n' "$f" "$n" "$(echo "$code" | sed 's/^ *//')"
        ;;
      *)
        shared=$((shared + 1))
        printf '  🛑 ОБЩЕЕ   %s:%s\n             %s\n' "$f" "$n" "$(echo "$code" | sed 's/^ *//')"
        ;;
    esac
  done < <(grep -rnE "^(let [a-zA-Z_]+|const [a-zA-Z_]+ *(:[^=]*)?= *(new (Map|Set)\(|new (Map|Set)<))" \
    "$d" --include='*.ts' 2>/dev/null | grep -v '\.test\.ts' | grep -viE "interval|timeout|logger|client\b")
done

echo
echo "  с ключом: $keyed; общих на процесс: $shared"
echo
echo "  ВОПРОС К КАЖДОМУ: а если владельцев двое?"
echo "  «Ключ есть» — не оправдание: ключ должен быть ВЛАДЕЛЬЦЕМ, а не чатом,"
echo "  если факт относится к владельцу. Set без ключа — почти всегда общее."
