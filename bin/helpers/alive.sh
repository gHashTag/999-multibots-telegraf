#!/bin/bash
# tri alive — дышит ли продавец: сколько прошло с последнего обхода.
#
# ЗАЧЕМ (форма 69). 16.09.2026 обход пропустил тик: деплой перезапустил бота,
# крон пришёл в неотвечающее приложение, Inngest записал 502. В журнале улья
# при этом НЕ ПОЯВИЛОСЬ НИЧЕГО — потому что туда пишутся только состоявшиеся
# обходы (idle / card / failed), а `held` и несработавший тик молчат.
#
# Из этого следует неприятное: обход, которого НЕ БЫЛО, и обход, прошедший
# тихо, из журнала неразличимы. Если крон однажды перестанет срабатывать
# совсем — из-за биллинга, конфигурации или неудачного деплоя — доска будет
# выглядеть ровно так же, как в спокойный день.
#
# Команда отвечает на один вопрос: сколько прошло с последнего СЛЕДА обхода и
# не больше ли это, чем может быть при живом кроне.
#
# ВАЖНО ПРО УДЕРЖАНИЕ. Оно законно молчит до двух часов (HOLD_MS_DEFAULT), а
# с растущей паузой при непрожатых карточках — до суток. Поэтому тревога
# поднимается не на «тихо», а на «тише, чем позволяет самая длинная законная
# пауза».
set -u
ROOT="${1:?нужен корень репозитория}"
cd "$ROOT" || exit 1

AK=$( (railway service vibee-render >/dev/null 2>&1; railway variables --kv 2>/dev/null) \
      | grep -E '^AGENT_KEYS=' | cut -d= -f2- | cut -d: -f1 )
[ -n "$AK" ] || { echo "нет ключа агента"; exit 2; }
BASE="${RENDER_BASE:-https://vibee-render-production.up.railway.app}"

RESP=$(curl -s --max-time 45 "$BASE/mcp" -H "X-Agent-Key: $AK" \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"hive_events","arguments":{"limit":200}}}')
[ -n "$RESP" ] || { echo "🛑 прод не ответил — вывода НЕ делаю"; exit 2; }

# ПРЕДЕЛ БЕРЁМ ИЗ КОДА, КОТОРЫЙ В ПРОДЕ — и признаёмся, если не прочитали.
#
# Первая версия читала рабочую копию и молча подставляла 24 при неудаче.
# В рабочей ветке этой константы НЕТ вовсе (она приехала на main с #2451),
# так что grep не находил ничего, а умолчание случайно совпадало с правдой.
# Число было верным по совпадению — а значит, перестало бы быть верным
# ровно тогда, когда предел изменят, и никто бы не заметил (форма 65).
#
# Читаем с origin/main: сравнивать поведение прода надо с кодом прода.
git fetch -q origin main 2>/dev/null
CAP_H=$(git show origin/main:src/services/crmProactive.ts 2>/dev/null \
        | grep -oE 'BACKOFF_CAP_MS = [0-9]+ \* 60 \* 60_000' \
        | grep -oE '= [0-9]+' | grep -oE '[0-9]+')
if [ -z "$CAP_H" ]; then
  echo "🛑 не прочитал BACKOFF_CAP_MS с origin/main — вывода НЕ делаю."
  echo "   Судить о тишине по пределу, которого не видел, значит выдумать его."
  exit 2
fi

RESP="$RESP" CAP_H="$CAP_H" python3 - <<'PY'
import json, os, sys, datetime, collections

try:
    ev = json.loads(json.loads(os.environ['RESP'])['result']['content'][0]['text'])
except Exception as e:
    print('ответ прода не разобран: %s' % str(e)[:80]); sys.exit(2)
if isinstance(ev, dict):
    ev = ev.get('events') or []
if not ev:
    print('🛑 журнал пуст в ответе — вывода НЕ делаю'); sys.exit(2)

def when(e):
    s = str(e.get('at', '')).replace('Z', '+00:00')
    try: return datetime.datetime.fromisoformat(s)
    except Exception: return None

now = datetime.datetime.now(datetime.timezone.utc)
sweeps = [e for e in ev if str(e.get('kind', '')).startswith('sweep')]
if not sweeps:
    print('🛑 в выборке нет НИ ОДНОГО обхода -- окно мало или обход не ходит')
    print('   Это не приговор: возьмите окно шире.')
    sys.exit(2)

last = max(x for x in (when(e) for e in sweeps) if x)
gap_h = (now - last).total_seconds() / 3600.0
cap = float(os.environ['CAP_H'])

print('-- дышит ли продавец --')
print()
print('  последний след обхода: %s UTC' % last.strftime('%Y-%m-%d %H:%M'))
print('  прошло:                %.1f ч' % gap_h)
print('  самая длинная законная пауза (BACKOFF_CAP_MS): %.0f ч' % cap)
print()
by = collections.Counter(e.get('kind') for e in sweeps)
print('  обходов в выборке: %d  %s' % (len(sweeps), dict(by)))
print()
if gap_h > cap:
    print('  🛑 ТИШЕ, ЧЕМ ПОЗВОЛЯЕТ УДЕРЖАНИЕ. Обход, которого не было, и обход,')
    print('     прошедший тихо, в журнале НЕРАЗЛИЧИМЫ -- поэтому смотреть надо')
    print('     не сюда, а туда, где видно сам тик:')
    print('        railway logs | grep -i "crm-proactive\\|INNGEST"')
    sys.exit(1)
if gap_h > 2:
    print('  ⚠️  дольше двух часов -- законно при непрожатой карточке (удержание),')
    print('     но проверьте, что карточка и правда висит: tri funnel')
    sys.exit(0)
print('  ✅ обход ходит')
PY
