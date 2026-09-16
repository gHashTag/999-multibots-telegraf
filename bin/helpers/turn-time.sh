#!/bin/bash
# tri turn-time [событий] — сколько длится ход обхода, считая от его же тика.
#
# ЗАЧЕМ. 16.09.2026 обход упал с «This operation was aborted» — это наш
# собственный AbortController, а не обрыв связи. Ход не уложился в бюджет. Ход,
# который К ТОМУ МОМЕНТУ УЖЕ СДЕЛАЛ КАРТИНКУ: деньги потрачены, карточка не
# родилась.
#
# Вопрос: это выброс или бюджет вообще тесен? Единственный доступный замер —
# расстояние от события в журнале до тика крона, который его породил. Событие
# пишется в конце хода, тик стоит на :00 и :30, значит разница и есть
# длительность хода с точностью до секунды записи.
#
# ЧЕГО ЗАМЕР НЕ ВИДИТ. Обходы, запущенные НЕ по расписанию (нажатием), к тикам
# не привязаны. Такие строки помечены и в статистику не идут: подогнать их под
# ближайший тик значило бы придумать длительность.
set -u
ROOT="${1:?нужен корень репозитория}"
LIMIT="${2:-200}"
cd "$ROOT" || exit 1

KEY=$( (railway service vibee-render >/dev/null 2>&1; railway variables --kv 2>/dev/null) \
       | grep -E '^RENDER_API_KEY=' | cut -d= -f2- )
[ -n "$KEY" ] || { echo "🛑 не прочитал ключ рендера — вывода НЕ делаю."; exit 2; }

# БЮДЖЕТ ЧИТАЕТСЯ ИЗ КОДА, КОТОРЫЙ В ПРОДЕ (форма 70): умолчание, случайно
# совпавшее с правдой, от честного чтения по выводу неотличимо.
BUDGET=$(git show origin/main:src/services/trinityAgent.ts 2>/dev/null \
  | grep -oE 'ЖДАТЬ_МС = [0-9_]+' | head -1 | grep -oE '[0-9_]+' | tr -d '_')
if [ -z "$BUDGET" ]; then
  echo "🛑 не прочитал бюджет хода с origin/main — вывода НЕ делаю."
  echo "   Судить о тесноте предела, которого не видел, значит выдумать его."
  exit 2
fi

ANSWER=$(curl -s --max-time 30 \
  "https://vibee-render-production.up.railway.app/mcp?telegram_id=144022504" \
  -H "X-Api-Key: $KEY" -H 'Content-Type: application/json' \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"hive_events\",\"arguments\":{\"limit\":$LIMIT}}}")

ANSWER="$ANSWER" BUDGET="$BUDGET" python3 - <<'PYEOF'
import json, os, re, sys
from datetime import datetime

budget_s = int(os.environ['BUDGET']) / 1000
try:
    r = json.loads(os.environ['ANSWER'])
except Exception:
    print('🛑 ответ не разобрался как JSON — вывода НЕ делаю.'); sys.exit(2)
if 'error' in r:
    print('🛑 журнал ответил ошибкой:', str(r['error'])[:160]); sys.exit(2)
res = r.get('result')
if not isinstance(res, dict):
    print('🛑 в ответе нет result — вывода НЕ делаю.'); sys.exit(2)
s = res.get('structuredContent')
if s is None:
    try: s = json.loads(res['content'][0]['text'])
    except Exception: print('🛑 не разобрал содержимое.'); sys.exit(2)
events = s if isinstance(s, list) else (s.get('events') or s.get('rows') or [])
if not events:
    print('🛑 журнал вернул НОЛЬ событий — вывода НЕ делаю.'); sys.exit(2)

KINDS = {'sweep-card', 'sweep-idle', 'sweep-failed'}
# ДВА РАЗНЫХ ЧИСЛА, И НИКОГДА НЕ В ОДНОЙ КУЧЕ.
#
# `[123s]` в конце строки — длительность, которую обход ИЗМЕРИЛ сам. Разница
# «тик → запись» — оценка снаружи, и в неё входит всё, чего измеренное число
# не включает. Смешать их в одной колонке значило бы получить среднее по двум
# разным величинам и не суметь сказать, какое из них ответило.
TOOK = re.compile(r'\[(\d+)s\]\s*$')
rows, loose = [], 0
for e in events:
    if e.get('kind') not in KINDS:
        continue
    raw = str(e.get('at') or e.get('created_at') or '')[:19]
    # ПОЛЕ НАЗЫВАЕТСЯ `note`. Поля `text` у события улья нет вовсе, и чтение
    # его отдавало пустую строку на каждой записи: столбец пояснений в этом
    # выводе был пуст с самого начала, и я этого не заметил.
    text = str(e.get('note') or e.get('text') or '')
    try:
        t = datetime.strptime(raw, '%Y-%m-%dT%H:%M:%S')
    except Exception:
        continue
    m = TOOK.search(text)
    if m:
        rows.append((float(m.group(1)), raw, e.get('kind'), text[:44], 'измерено'))
        continue
    tick = t.replace(minute=(30 if t.minute >= 30 else 0), second=0)
    took = (t - tick).total_seconds()
    if took > 300:      # почти наверняка запущен нажатием, а не расписанием
        loose += 1
        continue
    rows.append((took, raw, e.get('kind'), text[:44], 'оценка'))

if not rows:
    print('🛑 ни одного обхода, привязанного к тику — вывода НЕ делаю.'); sys.exit(2)

if rows and not any(r[3] for r in rows):
    print('⚠️  ни у одной записи нет пояснения — возможно, поле переименовали;')
    print('    длительности ниже верны, пояснения справа читать нельзя.')
rows.sort(reverse=True)
took_all = sorted(r[0] for r in rows)
near = [t for t in took_all if t >= budget_s * 0.9]
over = [t for t in took_all if t >= budget_s]
mid = took_all[len(took_all) // 2]

# ЧТО ИМЕННО ИЗМЕРЕНО — ГОВОРИТЬ ДО ЧИСЕЛ, А НЕ ПОСЛЕ.
# Первая версия называла это «длительностью хода» и сравнивала с бюджетом
# хода. Но от тика до записи в журнал проходит ВЕСЬ обход: обновление памяти,
# просмотр очереди, ход модели (иногда дважды), отправка карточки. Бюджет
# покрывает только ход. Строка «за бюджетом» здесь — повод смотреть, а не
# доказательство, что ход не уложился.
print(f'бюджет ХОДА МОДЕЛИ: {budget_s:g} с (ЖДАТЬ_МС с origin/main)')
print('«измерено» — сам обход, от начала до исхода. «оценка» — тик → запись')
print('в журнал: туда входит и то, чего бюджет хода не покрывает.')
measured = sum(1 for r in rows if r[4] == 'измерено')
print(f'строк: {len(rows)}   из них ИЗМЕРЕНО самим обходом: {measured}, '
      f'оценено по тику: {len(rows) - measured}   вне расписания, пропущено: {loose}')
if measured == 0:
    print('   (меток [Ns] в журнале ещё нет — это работает с деплоя, где обход')
    print('    начал писать собственный замер; пока всё ниже — оценка снаружи)')
print(f'медиана: {mid:g} с   самый долгий: {took_all[-1]:g} с')
print()
for took, at, kind, text, src in rows[:14]:
    mark = '🛑' if took >= budget_s else ('⚠️' if took >= budget_s * 0.9 else '  ')
    print(f'  {mark} {took:5.0f} с  {src:<8} {at}  {kind:<12} {text}')
print()
if not near:
    print(f'✅ ни один ход не подошёл к бюджету ближе, чем на {budget_s*0.1:g} с.')
    sys.exit(0)
print(f'⚠️  обходов в последних 10% бюджета: {len(near)}, длиннее бюджета: {len(over)}.')
print('   Обход длиннее бюджета НЕ доказывает, что ход модели не уложился, —')
print('   в него входит и всё остальное. Но предел, к которому подходят')
print('   вплотную, уже не страховка: он участвует в работе.')
print('   Доказательство даёт только «This operation was aborted» в sweep-failed.')
sys.exit(1)
PYEOF
