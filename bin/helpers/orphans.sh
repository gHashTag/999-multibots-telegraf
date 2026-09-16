#!/bin/bash
# tri orphans [сколько событий] — сколько подготовленных карточек ушло НЕ нажатыми.
#
# ЗАЧЕМ. Карточка, которая не дождалась нажатия, уходит из очереди по одной из
# четырёх причин: cancelled, replaced, expired, failed. Три из них — обычная
# жизнь. `replaced` у ФОТО-черновика — это деньги: картинка уже сгенерирована
# у провайдера, а уехала в никуда, потому что следующая карточка вытеснила
# предыдущую (очередь держит одну на владельца).
#
# 16.09.2026 в проде: четыре такие строки за день. Нашлись они не тестами и не
# логом, а этим вопросом, заданным журналу улья.
#
# ПОЧЕМУ БЕЗ ДЕНЕГ В ВЫВОДЕ. Подарочная картинка не списывает токенов — платит
# дом, кредитами провайдера, и этой цены в репозитории нет. Печатать «$1.23»,
# посчитанные по числу из головы, — ровно та ошибка, ради которой писалась
# форма 70. Здесь считаются ШТУКИ, а цену пусть назовёт тот, кто её видит.
set -u
ROOT="${1:?нужен корень репозитория}"
LIMIT="${2:-200}"
cd "$ROOT" || exit 1

KEY=$( (railway service vibee-render >/dev/null 2>&1; railway variables --kv 2>/dev/null) \
       | grep -E '^RENDER_API_KEY=' | cut -d= -f2- )
if [ -z "$KEY" ]; then
  echo "🛑 не прочитал ключ рендера — вывода НЕ делаю."
  echo "   «Сиротъ нет», напечатанное без доступа к журналу, — это не ответ."
  exit 2
fi

ANSWER=$(curl -s --max-time 30 \
  "https://vibee-render-production.up.railway.app/mcp?telegram_id=144022504" \
  -H "X-Api-Key: $KEY" -H 'Content-Type: application/json' \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"hive_events\",\"arguments\":{\"limit\":$LIMIT}}}")

# ОШИБКА — ЭТО НЕ ПУСТОЙ СПИСОК.
#
# Первая версия этого разбора шла по .get('result',{}).get(...,[]) и на ответ
# «нужна подпись» напечатала «инструментов: 0» — правдоподобное число,
# полученное из отказа. Здесь ошибка обрывает работу, а не превращается в ноль.
ANSWER="$ANSWER" python3 - <<'PYEOF'
import json, os, re, sys

raw = os.environ['ANSWER']
try:
    r = json.loads(raw)
except Exception:
    print('🛑 ответ не разобрался как JSON — вывода НЕ делаю:')
    print('   ' + raw[:200])
    sys.exit(2)
if 'error' in r:
    print('🛑 журнал ответил ошибкой — вывода НЕ делаю:')
    print('   ' + str(r['error'].get('message', r['error']))[:200])
    sys.exit(2)

res = r.get('result')
if not isinstance(res, dict):
    print('🛑 в ответе нет result — вывода НЕ делаю.')
    sys.exit(2)
s = res.get('structuredContent')
if s is None:
    try:
        s = json.loads(res['content'][0]['text'])
    except Exception:
        print('🛑 не разобрал содержимое ответа — вывода НЕ делаю.')
        sys.exit(2)
events = s if isinstance(s, list) else (s.get('events') or s.get('rows') or [])
if not events:
    print('🛑 журнал вернул НОЛЬ событий. Пустой журнал и недоступный журнал')
    print('   выглядят одинаково, поэтому вывода НЕ делаю.')
    sys.exit(2)

at = lambda e: str(e.get('at') or e.get('created_at') or '')[:19]
stamps = sorted(x for x in (at(e) for e in events) if x)
# ЧИСЛО БЕЗ ОКНА НИЧЕГО НЕ ЗНАЧИТ. «Четыре сироты» — это много или мало,
# зависит от того, за час они или за месяц.
print(f'окно: {stamps[0]} … {stamps[-1]} UTC, событий: {len(events)}')

RE = re.compile(r'(фото-черновик|черновик)\s+(\S+)\s+(cancelled|replaced|expired|failed)')
photo, plain = {}, {}
lines = []
for e in events:
    text = str(e.get('text') or e.get('note') or '')
    m = RE.search(text)
    if not m:
        continue
    kind, cid, why = m.group(1), m.group(2), m.group(3)
    (photo if kind == 'фото-черновик' else plain)[why] = \
        (photo if kind == 'фото-черновик' else plain).get(why, 0) + 1
    lines.append((at(e), kind, cid, why))

if not lines:
    print('✅ ни одна карточка не ушла не нажатой — в этом окне.')
    raise SystemExit(0)

print()
for label, box in (('ФОТО (картинка уже сделана)', photo), ('без картинки', plain)):
    if box:
        parts = ', '.join(f'{k}: {v}' for k, v in sorted(box.items()))
        print(f'  {label}: {parts}')

print()
for ts, kind, cid, why in lines[:20]:
    mark = '💸' if kind == 'фото-черновик' else '  '
    print(f'  {mark} {ts}  {cid}  {why}')

worst = photo.get('replaced', 0)
if worst:
    print()
    print(f'🛑 {worst} готовых КАРТИНОК вытеснено новой карточкой и не отправлено.')
    print('   Вытеснение — не истечение: карточку было ещё можно нажать.')
    raise SystemExit(1)
raise SystemExit(0)
PYEOF
