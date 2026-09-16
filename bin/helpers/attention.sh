#!/bin/bash
# tri attention — на кого продавец тратит карточки и кто остаётся без внимания.
#
# ЗАЧЕМ. 16.09.2026: 59 карточек за 4.4 суток ушли двенадцати людям, причём 37
# из них — троим. Вопрос «правильным ли людям» напрашивается сам, но ответить
# на него в лоб нельзя, и вот почему.
#
# ДВА СПИСКА — ДВА РАЗНЫХ ОПРЕДЕЛЕНИЯ, И СРАВНИВАТЬ ИХ В ЛОБ НЕЛЬЗЯ.
# Я попробовал и получил «17 горячих без единой карточки» — цифру, которая
# звучит как приговор и ничего не значит:
#
#   crm_hot_leads — говорил о цене или покупке за 14 дней И молчит ~30 дней.
#                   Это очередь ВОЗВРАТА, список «к кому вернуться».
#   crm_leads     — ранжирует тех, кто пишет СЕЙЧАС, по счёту и next.
#                   Это очередь работы, и обход берёт кандидатов ровно отсюда.
#
# Человек может быть в первом и отсутствовать во втором совершенно законно:
# он молчит месяц, значит в «пишет сейчас» его нет. Поэтому команда печатает
# оба списка РЯДОМ, с их определениями, и НЕ вычитает один из другого.
#
# Что она показывает по делу: насколько узко распределено внимание (три
# человека на две трети карточек — это не разнообразие) и сколько людей из
# очереди возврата не получили ничего ни разу.
set -u
ROOT="${1:?нужен корень репозитория}"
cd "$ROOT" || exit 1

KEY=$( (railway service vibee-render >/dev/null 2>&1; railway variables --kv 2>/dev/null) \
       | grep -E '^RENDER_API_KEY=' | cut -d= -f2- )
AK=$( (railway service vibee-render >/dev/null 2>&1; railway variables --kv 2>/dev/null) \
      | grep -E '^AGENT_KEYS=' | cut -d= -f2- | cut -d: -f1 | cut -d, -f1 )
[ -n "$KEY" ] && [ -n "$AK" ] || { echo "🛑 не прочитал ключи — вывода НЕ делаю."; exit 2; }

B="https://vibee-render-production.up.railway.app"
call_owner() { curl -s --max-time 30 "$B/mcp?telegram_id=144022504" -H "X-Api-Key: $KEY" \
  -H 'Content-Type: application/json' -d "$1"; }
call_agent() { curl -s --max-time 30 "$B/mcp" -H "X-Agent-Key: $AK" \
  -H 'Content-Type: application/json' -d "$1"; }

HOT=$(call_owner '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"crm_hot_leads","arguments":{"limit":50}}}')
LEADS=$(call_owner '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"crm_leads","arguments":{"limit":10}}}')
EV=$(call_agent '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"hive_events","arguments":{"limit":200}}}')

HOT="$HOT" LEADS="$LEADS" EV="$EV" python3 - <<'PYEOF'
import os, json, re, sys, collections

# ИМЕНА КЛЮЧЕЙ — ИЗ ОТВЕТА, А НЕ ИЗ ГОЛОВЫ (форма 79).
#
# Ответы этого сервера частью на русском: `люди`, `найдено`, `candidates`.
# Я дважды за сутки искал `leads`/`rows`, получал пустоту и печатал ноль как
# факт. Поэтому: не нашли ожидаемого ключа — покажи, какие есть, и выйди.
def unpack(raw, what):
    try:
        d = json.loads(raw)
    except Exception:
        print(f'🛑 {what}: ответ не разобрался как JSON — вывода НЕ делаю.'); sys.exit(2)
    if 'error' in d:
        print(f'🛑 {what}: сервер ответил ошибкой — вывода НЕ делаю.'); sys.exit(2)
    res = d.get('result')
    if not isinstance(res, dict):
        print(f'🛑 {what}: в ответе нет result — вывода НЕ делаю.'); sys.exit(2)
    s = res.get('structuredContent')
    if s is None:
        try: s = json.loads(res['content'][0]['text'])
        except Exception:
            print(f'🛑 {what}: содержимое не разобралось — вывода НЕ делаю.'); sys.exit(2)
    return s

def rows_of(s, names, what):
    if isinstance(s, list):
        return s
    for n in names:
        if isinstance(s.get(n), list):
            return s[n]
    print(f'🛑 {what}: не нашёл списка среди ключей {sorted(s.keys())[:10]}.')
    print('   Раньше здесь молча печатался ноль — это и есть форма 79.')
    sys.exit(2)

hot_s = unpack(os.environ['HOT'], 'crm_hot_leads')
leads_s = unpack(os.environ['LEADS'], 'crm_leads')
ev_s = unpack(os.environ['EV'], 'hive_events')

hot = rows_of(hot_s, ('люди', 'leads', 'rows'), 'crm_hot_leads')
leads = rows_of(leads_s, ('candidates', 'люди', 'rows'), 'crm_leads')
ev = rows_of(ev_s, ('events', 'rows'), 'hive_events')

# ОПОЗНАВАТЕЛЬ БЕРЁТСЯ ИЗ ВСЕХ ИЗВЕСТНЫХ ПОЛЕЙ, А НЕЗНАНИЕ НАЗЫВАЕТСЯ ВСЛУХ.
#
# `crm_hot_leads` отдаёт `ссылка`, `crm_leads` — `username`. Первая версия
# знала только про `ссылка`, печатала «@?» и рядом «карточек НЕ было» — то
# есть выдавала НЕЗНАНИЕ за факт, ровно то, за чем эта команда и написана.
def user_of(r):
    u = str(r.get('username') or '').strip().lstrip('@')
    if u:
        return u.lower()
    link = str(r.get('ссылка') or r.get('link') or '')
    return link.rsplit('/', 1)[-1].lower() if link else ''

cards = [e for e in ev if e.get('kind') == 'sweep-card']
got = collections.Counter()
for e in cards:
    m = re.search(r'\(@+([A-Za-z0-9_]+)\)', str(e.get('note') or ''))
    if m:
        got[m.group(1).lower()] += 1

total = sum(got.values())
if not total:
    print('🛑 в окне журнала нет ни одной карточки с именем — вывода НЕ делаю.')
    sys.exit(2)

print(f'карточек в окне журнала: {total}, людей: {len(got)}')
print()
print('  НА КОГО УШЛО ВНИМАНИЕ:')
for u, n in got.most_common(10):
    bar = '█' * min(20, n)
    print(f'    {n:3d}  @{u:<22} {bar}')
top3 = sum(n for _, n in got.most_common(3))
print(f'    ── трое первых собрали {top3} из {total} ({top3 * 100 // total}%)')

print()
print('  ОЧЕРЕДЬ РАБОТЫ (crm_leads: кто пишет СЕЙЧАС, по счёту и next)')
print('  — отсюда обход берёт кандидатов, первых пять:')
for r in leads[:5]:
    u = user_of(r)
    if not u:
        print(f'    next={str(r.get("next")):<8} счёт={r.get("score","?"):<4} '
              f'{"(имени нет)":<21} не знаю, кто это — сверить не с чем')
        continue
    seen = got.get(u, 0)
    mark = f'{seen} карточек' if seen else 'карточек НЕ было'
    print(f'    next={str(r.get("next")):<8} счёт={r.get("score","?"):<4} @{u:<20} {mark}')

hot_users = {user_of(r) for r in hot if user_of(r)}
never = sorted(u for u in hot_users if u not in got)
print()
print('  ОЧЕРЕДЬ ВОЗВРАТА (crm_hot_leads: говорил о покупке за 14 дней,')
print('  но молчит ~месяц) — ДРУГОЙ список, из одного не вычитать другой:')
print(f'    всего {len(hot_users)}, из них без единой карточки: {len(never)}')
for u in never[:8]:
    print(f'      @{u}')
if len(never) > 8:
    print(f'      … и ещё {len(never) - 8}')
print()
print('  Молчащий месяц законно отсутствует в «пишет сейчас». Это не дефект')
print('  выбора — это вопрос, работает ли с очередью возврата хоть кто-нибудь.')
PYEOF
