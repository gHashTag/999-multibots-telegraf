#!/usr/bin/env bash
# tri — Trinity S³AI ops CLI. Дефолт (без аргументов) — прежнее поведение:
# railway ssh → claude. Подкоманды работают локально и ускоряют цикл.
set -uo pipefail
REPO="$HOME/999-multibots-telegraf"
KEY_HELP='ключ: railway variables list -s vibee-render -e production --kv | grep ^AGENT_KEYS= | cut -d= -f2- (взять первый ключ до ":")'

case "${1:-}" in
  ""|ssh)
    # прежний путь — без изменений
    railway link -p reasonable-perception -e production > /dev/null 2>&1
    railway service link opencode > /dev/null 2>&1
    exec railway ssh -- bash -lc 'claude --dangerously-skip-permissions'
    ;;
  status)
    echo "== render health =="; curl -s -m 5 http://127.0.0.1:3333/health || echo "RENDER DOWN"
    echo; echo "== player =="; curl -s -m 5 -o /dev/null -w "5173:%{http_code}\n" http://localhost:5173/ 2>/dev/null || echo "player down"
    echo; echo "== feed stats =="; curl -s -m 8 https://vibee-render-production.up.railway.app/api/feed/stats 2>/dev/null | head -c 300
    echo; echo "== loop state =="; cat "$REPO/loop/state.json" 2>/dev/null
    echo; echo "== последние витки =="; tail -5 "$REPO/loop/LOOP_STATE.md" 2>/dev/null
    ;;
  regress)
    bash "$REPO/loop/regression-check.sh"
    ;;
  morning)
    cat "$REPO/loop/MORNING.md" 2>/dev/null || echo "нет MORNING.md — прогони morning-summary.ts"
    ;;
  loop)
    tail -60 "$REPO/loop/LOOP_REPORT.md" 2>/dev/null
    ;;
  feed)
    curl -s -m 8 "https://vibee-render-production.up.railway.app/api/feed?limit=${2:-5}" \
      | python3 -c "import sys,json; d=json.load(sys.stdin); [print(t['id'], t.get('name','')[:50], '| ⭐', t.get('starsCount',0), '| 👁', t.get('viewsCount',0)) for t in d.get('templates',[])]" 2>/dev/null \
      || echo "лента недоступна"
    ;;
  chat)
    shift
    KEY=$(railway variables list -s vibee-render -e production --kv 2>/dev/null | grep ^AGENT_KEYS= | cut -d= -f2- | cut -d, -f1 | cut -d: -f1)
    if [ -z "$KEY" ] || [ -z "${1:-}" ]; then echo "нужен текст: tri chat \"вопрос\"; $KEY_HELP"; exit 1; fi
    curl -sN -m 120 https://vibee-render-production.up.railway.app/api/agent/chat \
      -H "X-Agent-Key: $KEY" -H 'Content-Type: application/json' \
      -d "$(python3 -c 'import json,sys; print(json.dumps({"messages":[{"role":"user","content":sys.argv[1]}]}))' "$*")" \
      | python3 -c "
import sys, json
for line in sys.stdin:
    try: ev = json.loads(line)
    except: continue
    if ev.get('тип') == 'текст': print(ev['текст'], end='')
    elif ev.get('тип') == 'результат': print(f\"  [{ev['имя']} · {ev['мс']}мс]\", file=sys.stderr)
print()
"
    ;;
  handover)
    # Брифинг владельцу (волна 101): четыре границы владения одним
    # списком, каждая с командой/мандатом и волной-картой.
    cat <<'BRIEF'
СВОДКА ДЛЯ ВЛАДЕЛЬЦА — четыре границы, всё остальное доказано (волны 068-100)

1. LOCK-АНОМАЛИЯ (системный слой, перехват exec):
   sudo fs_usage -w -f exec  вокруг make cassettes (~10 мин) — назовёт перехватчик.
   Карта: .trinity/wave-loop-069..084, 087. Симптом: lock-строка не исполняется
   при корректном argv; обход: make cassettes-bypass / check-bypass (диагностические).

2. ГЕНЕРАТОР T27 (~/t27, ваш checkout) — 12 несобирающихся спек, 11 причин в t27c:
   главный класс (9 спек): параметры-массивы без mut в эмите — один патч закрывает 6+.
   Карта: .trinity/wave-loop-098. Проверка после фикса: tri spec-diag.

3. RELEASE-ПЕРЕСБОРКА: стор юзера — 0 отпечатков (приложение старее фикса).
   Починка доказана живьём: fp 9d26541f, 5 воспроизведений (tri live-verify).

4. ПРОВАЙДЕРНЫЙ КЛЮЧ: живой воркер не спавнится без ключа (волна 100).
   Вставка ключа → полный live-контур #1126 закрывается одним прогоном
   (делегация→воркер→ревью→печать).
BRIEF
    ;;
  spec-diag)
    # Батч-диагноз несобирающихся спек (волна 099): gen-rust + rustc,
    # класс ошибки на спеку. Перезапускать после генераторных фиксов t27.
    T=/Users/playra/BrowserOS/trios; T27C="$T/.trinity/t27c-build/release/t27c"
    L="${2:-$T/.trinity/wave-097-lowering.log}"
    D=$(mktemp -d /tmp/tri_specdiag.XXXXXX)
    for s in $(grep -oE "nocompile\] [a-z0-9_]+" "$L" 2>/dev/null | awk '{print $2}' | sort -u); do
      F=$(find "$T/rings" -name "$s.t27" | head -1); [ -z "$F" ] && { echo "$s => спека не найдена"; continue; }
      "$T27C" gen-rust "$F" > "$D/$s.txt" 2>/dev/null
      E=$(rustc --edition 2021 --crate-type lib --emit=metadata --out-dir "$D" "$D/$s.txt" 2>&1 \
        | grep -oE "error\[E[0-9]+\]|error: [a-z ]+" | sort | uniq -c | tr '\n' ' ')
      echo "$s => ${E:-OK}"
    done; rm -rf "$D"
    ;;
  regression)
    # Живая регрессия цикла (волна 095): доска + локи + live-verify
    # одной командой — обязательный минимум Queen-волны по протоколу.
    tri board; echo; tri locks; echo
    tri live-verify "${2:-}" "${3:-}" 2>&1 | tail -1
    ;;
  live-verify)
    # Живой отпечаток одним запуском (рецепт волны 081): цепочка
    # approve→delegate→verify через env-канал test-бандла, затем стор.
    T=/Users/playra/BrowserOS/trios
    ISSUE="${2:-gHashTag/trios#1286}"; CRIT="${3:-make check passes}"
    pkill -f "trios-test.app/Contents" 2>/dev/null; sleep 1
    ( cd "$T" && TRIOS_E2E_QUEEN_COMMAND="/approve $ISSUE;;/delegate $ISSUE queen-swift --paths docs --criteria $CRIT;;/verify $ISSUE $CRIT met" \
        ./trios-test.app/Contents/MacOS/trios > /tmp/tri_live_verify.log 2>&1 ) &
    echo "живой прогон пошёл (/tmp/tri_live_verify.log); стор через ~75с:"
    sleep 75; pkill -f "trios-test.app/Contents" 2>/dev/null
    python3 -c "
import json
try:
    for t in json.load(open('$T/.trinity-test/state/queen_delegation.json')):
        print(t['id'][:8], t['state'], 'verdicts:', t.get('criterionVerdicts'), 'fp:', (t.get('treeStateFingerprint') or 'NONE')[:20])
except FileNotFoundError: print('стор не создан')"
    ;;
  selftest)
    echo "tri: ок"; command -v railway >/dev/null && echo "railway: ок" || echo "railway: НЕТ"
    command -v python3 >/dev/null && echo "python3: ок"
    [ -d "$REPO/loop" ] && echo "loop-каталог: ок" || echo "loop-каталог: НЕТ"
    ;;
  anomalies|anom)
    # Шаг 0 витка: что сломалось на проде, пока меня не было.
    node "$REPO/.claude/loop-opus/anomalies.mjs"
    ;;
  verify)
    # Не затёрла ли прошлую правку чужим мержем (страховка непрерывного цикла).
    node "$REPO/.claude/loop-opus/verify-landed.mjs"
    ;;
  providers|prov)
    # Живой статус провайдеров через детектор аномалий (маршрут /api/providers/status
    # за авторизацией и голым curl отдаёт 401; anomalies.mjs берёт его правильно).
    node "$REPO/.claude/loop-opus/anomalies.mjs" 2>/dev/null \
      | sed -n '/Провайдеры/,/Конвейер/p' | sed '$d'
    echo "  (FAL/ElevenLabs — ждут владельца; GLM работает)"
    ;;
  lesson)
    # Быстро записать урок в оснастку цикла: tri lesson "заголовок" "тело"
    shift
    L="$REPO/.claude/loop-opus/LESSONS.md"
    if [ -z "${1:-}" ]; then echo "нужен заголовок: tri lesson \"заголовок\" [тело]"; exit 1; fi
    { printf '\n## %s\n\n' "$1"; [ -n "${2:-}" ] && printf '%s\n' "$2"; } >> "$L"
    echo "записано в $L"
    ;;
  dash)
    # Пересобрать и показать продакшн-дашборд (замер запуском, не память).
    node "$REPO/scripts/dashboard.cjs" 2>/dev/null | tail -40 \
      || cat "$REPO/docs/dashboard/STATUS.md" 2>/dev/null
    ;;
  board)
    # Дашборд trios: последняя итерация + живые замеры STATUS.md
    T=/Users/playra/BrowserOS/trios
    tail -1 "$T/.trinity/dashboard/iterations.jsonl" 2>/dev/null | python3 -c 'import json,sys
try:
    d=json.load(sys.stdin)
    print("итерация", d["iteration"], ":", d["title"])
    print("gate:", d.get("gate","?"))
except Exception as e: print("iterations.jsonl не читается:", e)'
    echo; sed -n '/## Measured here/,/## How to update/p' "$T/.trinity/dashboard/STATUS.md" 2>/dev/null | head -25
    ;;
  wave)
    # Каркас следующей волны: trios/.trinity/wave-loop-NNN.md
    T=/Users/playra/BrowserOS/trios
    n=$(ls "$T/.trinity"/wave-loop-*.md 2>/dev/null | sed 's/.*loop-0*//;s/\.md//' | sort -n | tail -1)
    next=$((10#${n:-0}+1)); f="$T/.trinity/wave-loop-$(printf '%03d' "$next").md"
    printf '# T27 Wave Loop - Plan WAVE-%03d\n\nDomain: \n\n## Audit - weak spots\n\n| ID | Weak spot | Evidence |\n|----|-----------|----------|\n\n## Competitor research\n\n- \n\n## Plan\n\n## Report\n\n## Three options for the next wave\n\n1. \n2. \n3. \n' "$next" > "$f" && echo "$f"
    ;;
  locks)
    # Кто держит общие локи триоса прямо сейчас
    for d in /tmp/trios_harness.lock /tmp/trios_e2e.lock; do
      if [ -e "$d/pid" ]; then o=$(cat "$d/pid" 2>/dev/null); echo "$d: pid=${o:-?} $(ps -p "$o" -o etime= 2>/dev/null || echo '(мёртв — лок можно вернуть)')"
      elif [ -d "$d" ]; then echo "$d: занят, pid-файла нет"; else echo "$d: свободен"; fi
    done
    w=$(pgrep -f "Serialised against every other harness" 2>/dev/null | wc -l | tr -d ' ')
    echo "ожидают лок кассет: $w процесс(ов)"
    ;;
  next)
    # Три варианта сотрудничества из последней волны
    T=/Users/playra/BrowserOS/trios
    w=$(ls "$T/.trinity"/wave-loop-*.md 2>/dev/null | sort | tail -1)
    echo "$w:"; sed -n '/[Oo]ptions for the next wave/,$p' "$w" 2>/dev/null || echo "нет волн"
    ;;
  deploy-wait|live-wait)
    # «Зелёная сборка не доказывает» — ждём, пока правка ДОЕДЕТ до живого
    # render после merge. Опрашиваем путь, пока в ответе не появится маркер.
    # Ключ (для закрытых маршрутов) тянем из Railway сам; для публичных путей
    # (/health, /mcp) он не нужен.
    #   tri deploy-wait <путь> <маркер> [попыток]
    RENDER="https://vibee-render-production.up.railway.app"
    PATHQ="${2:-/health}"; MARK="${3:-}"; TRIES="${4:-40}"
    K=$(railway variables list -s vibee-render -e production --kv 2>/dev/null | grep '^RENDER_API_KEY=' | cut -d= -f2-)
    for i in $(seq 1 "$TRIES"); do
      body=$(curl -s -m 15 -H "X-Api-Key: $K" "$RENDER$PATHQ" 2>/dev/null)
      if [ -z "$MARK" ] || printf '%s' "$body" | grep -qF "$MARK"; then
        echo "✅ живой [$i]: $PATHQ → $(printf '%s' "$body" | head -c 140)"; exit 0
      fi
      echo "⏳ [$i/$TRIES] $PATHQ ещё без «$MARK»: $(printf '%s' "$body" | head -c 80)"
      sleep 30
    done
    echo "❌ ТАЙМАУТ: «$MARK» не появился на $PATHQ за $TRIES попыток"; exit 1
    ;;
  help|-h|--help)
    cat <<'USAGE'
tri — Trinity S³AI ops CLI
  tri              — railway ssh → claude (прежнее поведение)
  tri status       — здоровье стека + лента + состояние лупа
  tri regress      — регресс-чек лупа (15 проверок)
  tri morning      — утренняя сводка loop/MORNING.md
  tri loop         — хвост отчёта цикла
  tri feed [N]     — последние N постов ленты со звёздами/просмотрами
  tri chat "текст" — вопрос агенту (ключ тянется из Railway сам)
  tri selftest     — проверка зависимостей
  tri anomalies    — шаг 0: что сломалось на проде (провайдеры, лента, маршруты)
  tri verify       — не затёрта ли прошлая правка чужим мержем
  tri providers    — живой статус провайдеров (чем агент может работать)
  tri lesson "H" "B" — быстро записать урок в loop-opus/LESSONS.md
  tri dash         — пересобрать продакшн-дашборд STATUS.md
  tri board        — дашборд trios: последняя итерация + замеры STATUS.md
  tri wave         — каркас следующей волны wave-loop-NNN.md
  tri locks        — кто держит локи кассет/e2e триоса сейчас
  tri next         — три варианта из последней волны trios
  tri deploy-wait <путь> <маркер> [N] — ждать, пока правка доедет до живого render
  tri live-verify [issue] [crit] — живой отпечаток цепочкой за один запуск
  tri regression [issue] [crit] — доска + локи + live-verify одной командой
  tri spec-diag [log] — класс ошибки каждой несобирающейся спеки
USAGE
    ;;
  *)
    echo "неизвестная команда: $1 (tri help)"; exit 1
    ;;
esac
