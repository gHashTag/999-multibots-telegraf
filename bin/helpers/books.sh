#!/bin/bash
# tri books — какие ФАКТЫ CRM код умеет читать, но прод ни разу не записал.
#
# ЗАЧЕМ (форма 60). 16.09.2026: семь витков подряд я докладывал «подготовлено
# 64, отправлено 5» как утечку между карточкой и нажатием — и строил на этом
# наблюдаемость. Потом посмотрел, ЧТО пишет эту пятёрку: касание `written`
# пишется только `if (p.lead && ctx.pool)`, а карточка, адресованная по
# @username, lead не получает вовсе. То есть нажатие отправляло письмо и не
# писало ничего. Число мерило нашу бухгалтерию, а не мир.
#
# И это не единственное. В той же сводке прода: из ШЕСТИ видов касаний
# записан ровно один. `replied`, `later`, `refused`, `bought`, `note` — по
# нулю за всё время, при том что логика ветвится по ним в сорока местах
# (только `refused` — в тринадцати, включая штраф -10 к счёту лида).
#
# Ветка, в которую прод ни разу не заходил, — не поведение, а намерение.
# Тесты её покрывают, мутации в ней убиваются, и всё это ничего не говорит о
# том, случается ли она.
set -u
ROOT="${1:?нужен корень репозитория}"
cd "$ROOT" || exit 1

KEY=$( (railway service vibee-render >/dev/null 2>&1; railway variables --kv 2>/dev/null) \
       | grep -E '^AGENT_KEYS=' | cut -d= -f2- | cut -d: -f1 )
[ -n "$KEY" ] || { echo "нет ключа агента (railway variables)"; exit 2; }
BASE="${RENDER_BASE:-https://vibee-render-production.up.railway.app}"

RESP=$(curl -s --max-time 45 "$BASE/mcp" -H "X-Agent-Key: $KEY" \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"crm_summary","arguments":{}}}')

# ОТКАЗ НА ПУСТОМ ЧТЕНИИ. Пустой ответ и «ни одного факта» выглядят
# одинаково, и второе -- приговор. Молчание приговором не считается.
[ -n "$RESP" ] || { echo "🛑 прод не ответил — вывода НЕ делаю"; exit 2; }

# Сколько мест в логике ветвится по каждому виду -- считаем локально.
: > /tmp/tri-books-uses
for k in written replied later refused bought note; do
  n=$(grep -rn "'$k'" apps/vibee-editor/render/src src --include="*.ts" 2>/dev/null \
      | grep -v '\.test\.' | grep -cE 'kind|touch' || true)
  printf '%s\t%s\n' "$k" "${n:-0}" >> /tmp/tri-books-uses
done

RESP="$RESP" python3 - <<'PY'
import json, os, sys

try:
    txt = json.loads(os.environ['RESP'])['result']['content'][0]['text']
    s = json.loads(txt)
except Exception as e:
    print('🛒 ответ прода не разобран: %s' % str(e)[:80]); sys.exit(2)

kinds = s.get('touches_by_kind') or {}
if not kinds:
    print('🛑 в ответе нет touches_by_kind — вывода НЕ делаю'); sys.exit(2)

uses = {}
for line in open('/tmp/tri-books-uses'):
    k, n = line.split('\t')
    uses[k] = int(n)

print('── факты, которые код читает, а прод пишет ──')
print()
never, thin = [], []
for k, v in kinds.items():
    total = int((v or {}).get('total') or 0)
    last = (v or {}).get('last_at') or '—'
    u = uses.get(k, 0)
    mark = '🛑' if total == 0 else ('· ' if total >= 20 else '⚠️ ')
    print('  %s %-9s записано %-5d ветвлений в логике %-3d  последнее: %s'
          % (mark, k, total, u, str(last)[:24]))
    if total == 0 and u:
        never.append((k, u))
    elif 0 < total < 20 and u:
        thin.append((k, total, u))

print()
if never:
    tot = sum(u for _, u in never)
    print('  🛑 НИ РАЗУ НЕ ЗАПИСАНО, а логика на это опирается: %d вид(ов), %d ветвлений'
          % (len(never), tot))
    for k, u in sorted(never, key=lambda x: -x[1]):
        print('       %-9s %d мест' % (k, u))
    print()
    print('     Ветка, в которую прод ни разу не заходил, -- намерение, а не')
    print('     поведение. Тесты её покрывают, мутации в ней убиваются, и это')
    print('     ничего не говорит о том, случается ли она.')
    print('     Спрашивать надо не «верна ли ветка», а «кто пишет этот факт')
    print('     и при каком условии он это пропускает».')
if thin:
    print()
    print('  ⚠️  записано МАЛО -- проверь, что пишущий не отсекается условием:')
    for k, t, u in thin:
        print('       %-9s всего %d, ветвлений %d' % (k, t, u))
if not never and not thin:
    print('  ✅ каждый вид, на который опирается логика, прод записывает')
sys.exit(1 if never else 0)
PY
