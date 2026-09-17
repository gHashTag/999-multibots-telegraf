#!/bin/bash
# ЧТО РЕАЛЬНО УЕХАЛО В ПРОД -- И ПОЛЬЗУЕТСЯ ЛИ ИМ КТО-НИБУДЬ.
#
# Урок 07.09.2026. За цикл трижды выяснялось, что написанное, покрытое
# тестами и задеплоенное не доходило до людей:
#
#   /api/auth/telegram   -- маршрут без единого посетителя, девять итераций
#                           работы над сессиями касались только веба;
#   вход на iOS          -- поле обрезало код на шестой цифре, четыре итерации;
#   oidc_auth_requests   -- таблица, заводимая при каждом запуске, не нужная
#                           никому.
#
# Отсюда два РАЗНЫХ вопроса, и спрашивать надо оба:
#   1. код уехал?      -- скачать живой бандл и поискать в нём;
#   2. кодом пользуются? -- посчитать строки в базе.
# Первое без второго -- работа в стол.
set -uo pipefail

BASE="${VIBEE_APP:-https://app.t27.ai}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "— живая сборка ($BASE) —"
if ! curl -s -m 30 "$BASE/" -o "$TMP/i.html"; then
  echo "  сайт не отвечает -- проверка НЕ выполнена"; exit 1
fi
MAIN=$(grep -oE 'src="/assets/[^"]+\.js"' "$TMP/i.html" | head -1 | sed 's/src="//;s/"//')
if [ -z "$MAIN" ]; then
  echo "  главный бандл не найден в index.html -- проверка НЕ выполнена"; exit 1
fi
curl -s -m 60 "$BASE$MAIN" -o "$TMP/main.js"
echo "  бандл: $MAIN ($(wc -c < "$TMP/main.js") байт)"

# Экран кода лежит в ОТДЕЛЬНОМ куске профиля -- без него половина проверок
# ниже ответит "нет" про то, что на самом деле есть.
#
# Первая версия доставала имя через `tr -d '"./'`, и это удаляло ТОЧКУ ПЕРЕД
# js: получалось "Profile-BiDgJ6Arjs", кусок не скачивался, и команда честно
# печатала "нет  выдача кода входа" про работающий код. Проверка, которая
# врёт уверенно, хуже отсутствующей.
PROF=$(grep -oE 'Profile-[A-Za-z0-9_-]+\.js' "$TMP/main.js" | head -1)
if [ -n "$PROF" ]; then
  if ! curl -s -m 60 -f "$BASE/assets/$PROF" -o "$TMP/prof.js"; then
    echo "  кусок профиля ($PROF) не скачался -- часть проверок НЕ выполнена"
  fi
else
  echo "  кусок профиля не найден в бандле -- часть проверок НЕ выполнена"
fi

найти() { # имя, образец
  n=$(cat "$TMP"/*.js 2>/dev/null | grep -c "$2")
  if [ "${n:-0}" -gt 0 ]; then echo "  ЕСТЬ  $1"; else echo "  нет   $1"; fi
}
найти "обмен подписи на сессию" "api/auth/telegram"
найти "выдача кода входа" "api/auth/pair/start"
найти "обновление сессии" "api/auth/refresh"
# Адрес экрана кода. Был "tab=agent" -- ровно та ссылка, по которой 17.09.2026
# человеку показали счёт на 10 000 звёзд: профиль ушёл под дорогу приветствия,
# и вкладка с кодом перестала существовать для тех, кто по ней приходит. Теперь
# у экрана свой адрес, /pair, и искать надо его: старый образец в живом бандле
# больше не встречается ни разу, то есть проверка на него отвечала бы "нет" про
# работающий экран -- в точности та ложь, о которой предупреждает шапка файла.
найти "адрес экрана кода (/pair)" '"/pair"'

# Подставка для разработки: её присутствие -- дефект, а не свойство.
if cat "$TMP"/*.js 2>/dev/null | grep -q "mock-telegram"; then
  echo "  ДЕФЕКТ: подставка для разработки уехала в прод"
else
  echo "  ЕСТЬ  подставки для разработки нет (верно)"
fi

echo "— пользуются ли (счёт по базе) —"
if ! railway service postgres-nfrq >/dev/null 2>&1; then
  echo "  нет доступа к базе -- проверка НЕ выполнена"; exit 0
fi
URL=$(railway variables --kv 2>/dev/null | grep -E "^DATABASE_PUBLIC_URL=" | head -1 | cut -d= -f2-)
if [ -z "$URL" ]; then echo "  нет DATABASE_PUBLIC_URL -- проверка НЕ выполнена"; exit 0; fi
cat > "$TMP/c.mjs" <<'JS'
import pg from 'pg'
const c = new pg.Client({ connectionString: process.env.DB, ssl: { rejectUnauthorized: false } })
await c.connect()
for (const t of ['app_sessions', 'app_launch_families', 'app_pairing_codes']) {
  const r = await c.query(`SELECT count(*)::int n, max(created_at) last FROM ${t}`)
  console.log(`  ${t}: ${r.rows[0].n}${r.rows[0].last ? ', последняя ' + new Date(r.rows[0].last).toISOString().slice(0,16) : ' -- НИ ОДНОЙ'}`)
}
await c.end()
JS
cp "$TMP/c.mjs" apps/vibee-editor/render/.shipped-count.mjs
(cd apps/vibee-editor/render && DB="$URL" node .shipped-count.mjs 2>&1 | head -5)
rm -f apps/vibee-editor/render/.shipped-count.mjs
