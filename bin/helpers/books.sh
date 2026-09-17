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
#
# ПОПРАВКА, СЛЕДУЮЩИЙ ВИТОК. Первая версия печатала ОДИН приговор — «логика
# опирается на факт, которого нет» — и на всех пяти нулях он был неверен,
# каждый раз по-своему:
#
#   replied, note   писатель ЕСТЬ, но не на main. Его не надо писать заново,
#                   его надо доставить.
#   later, refused  писатель на main И кнопка на main. Ноль потому, что
#                   кнопка не РИСУЕТСЯ: клавиатура после отмены требует
#                   числового lead, а карточка по @username его не имеет.
#   written         писался, но условие `if (p.lead && ...)` отсекало.
#
# Ноль — это вопрос, а не ответ, и вопросов ровно три, по слоям: пишет ли это
# кто-нибудь ГДЕ-УГОДНО; лежит ли писатель В ПРОДЕ; доходит ли до него
# управление. Инструмент, отвечающий на первый и молчащий про второй,
# отправляет писать код, который уже написан.
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

RESP="$RESP" python3 - <<'PYBODY'
import json, os, re, subprocess, sys

KINDS = ['written', 'replied', 'later', 'refused', 'bought', 'note']
# A file writes a touch if it names the kind AND speaks to the touch layer --
# directly (recordTouch) or through the bot's own door (touchLead, crm_touch).
DOORS = ('recordTouch', 'touchLead', 'crm_touch', 'crm_touches')

try:
    txt = json.loads(os.environ['RESP'])['result']['content'][0]['text']
    summary = json.loads(txt)
except Exception as e:
    print('SUMMARY NOT PARSED: %s' % str(e)[:80]); sys.exit(2)

kinds = summary.get('touches_by_kind') or {}
if not kinds:
    print('no touches_by_kind in the answer -- no verdict'); sys.exit(2)

def sh(*a):
    return subprocess.run(a, capture_output=True, text=True)

files = [f for f in sh('git', 'ls-files', 'src',
                       'apps/vibee-editor/render/src').stdout.split()
         if f.endswith('.ts') and '.test.' not in f]

writers = {k: [] for k in KINDS}
# A WRITER IS A CALL, NOT A MENTION.
#
# The previous version counted any file that named the kind and mentioned
# the touch layer -- which swept in crm-touches.ts, where the union is
# DECLARED, and crm-stages.ts, which READS kinds to derive a stage. Both
# came back as writers in production, and `replied` was pronounced deployed
# while its only real writer sits unmerged. A reader counted as a writer is
# the same lie this command exists to catch.
#
# So: find the CALL, then look for the kind inside it. The window is
# generous because the argument object is usually formatted over several
# lines, and it catches a ternary exactly as it catches a plain literal.
CALL = re.compile(r"(recordTouch|touchLead)\s*\(|['\"]crm_touch['\"]")
WINDOW = 700

def writes(text, kind):
    for m in CALL.finditer(text):
        seg = text[m.start(): m.start() + WINDOW]
        if re.search(r"['\"]%s['\"]" % kind, seg):
            return True
    return False

for f in files:
    try:
        text = open(f, encoding='utf-8').read()
    except Exception:
        continue
    for k in KINDS:
        if writes(text, k):
            m = sh('git', 'show', 'origin/main:' + f)
            ok = m.returncode == 0 and writes(m.stdout, k)
            # WHEN THE WRITER APPEARED, not when the file was last touched.
            #
            # The first version asked for the file's most recent commit, which
            # is a different question with a comfortable wrong answer:
            # tg-proposals.ts had been writing `bought` for weeks and came back
            # as "46 hours old, too young to judge" because somebody edited
            # something else in it. `git log -S` walks to the commit that first
            # introduced the kind into that file, which is what "had time to
            # fire" actually means.
            since = ''
            if ok:
                hist = sh('git', 'log', '--format=%ct', '-S', "'" + k + "'",
                          'origin/main', '--', f).stdout.split()
                since = hist[-1] if hist else ''
            writers[k].append((f, ok, int(since) if since.isdigit() else 0))

uses = {}
for line in open('/tmp/tri-books-uses'):
    k, n = line.split('\t')
    uses[k] = int(n)

import time
now_s = time.time()
# A WRITER NEEDS TIME TO HAVE HAD AN OCCASION.
# 2026-09-16: `replied` was merged and deployed, and the very next run of this
# command called it unreached -- twenty minutes after the deploy, before a
# single ingest had seen a new message. Judging a writer before it could
# possibly have fired sends the next cycle to fix what is not broken.
YOUNG_H = 48
# РАЗОБРАННЫЕ НУЛИ. Ноль бывает верным ответом, и тогда он не находка.
#
# 16.09.2026: `bought` держался восемь дней как «писатель в проде, записей
# нет». Разбор показал, что ноль ПРАВИЛЬНЫЙ. Заряд на карточку ставится
# только при `gift: false`; подарок — значение по умолчанию
# (`gift = a?.gift !== false`), бриф обхода слова `gift` не содержит вовсе, а
# playbook прямо говорит «gift по умолчанию: получатель не платит». Значит
# тернарник `p.charge ? 'bought' : 'written'` не может дать `bought` — и не
# должен: платных доставок никто не покупал, потому что предлагать их
# продавцу не велено («не предлагай оплату первым»).
#
# Записано здесь, а не забыто, ровно по причине из формы 62: инструмент,
# который каждый виток показывает разобранное как новое, отправляет чинить
# то, что уже объяснено. Снимать запись — когда изменится причина, а не
# когда надоест.
EXPLAINED = {
    'bought': 'ноль верен: заряд только при gift=false, а подарок -- умолчание',
}
dead, stranded, unreached, young = [], [], [], []
explained = []
print('-- kto pishet fakt, lezhit li on v prode, skolko zapisano --')
print()
for k in KINDS:
    v = kinds.get(k) or {}
    total = int(v.get('total') or 0)
    ws = writers[k]
    shipped = [f for f, ok, _ in ws if ok]
    # The OLDEST deployed writer decides. The question is whether this fact
    # has had a chance at all, and it has if any writer has been there long
    # enough -- taking the newest would reset the clock every time a second
    # writer was added.
    oldest = min((t for _, ok, t in ws if ok and t), default=0)
    age_h = (now_s - oldest) / 3600.0 if oldest else None
    if not ws:
        verdict, mark = 'NIKTO NIGDE ne pishet', 'X'
        if uses.get(k):
            dead.append(k)
    elif not shipped:
        verdict, mark = 'pisatel EST, no NE na main', 'P'
        stranded.append((k, [os.path.basename(f) for f, _, _ in ws]))
    elif total == 0 and k in EXPLAINED:
        verdict, mark = 'ноль razobran: ' + EXPLAINED[k], '. '
        explained.append((k, EXPLAINED[k]))
    elif total == 0 and age_h is not None and age_h < YOUNG_H:
        verdict, mark = 'pisatel V PRODE %d ch -- rano sudit' % age_h, '.'
        young.append((k, age_h))
    elif total == 0:
        days = int(age_h / 24) if age_h else 0
        verdict, mark = 'V PRODE %d dn, zapisey net' % days, '?'
        unreached.append((k, [os.path.basename(f) for f in shipped], days))
    else:
        verdict, mark = 'pishetsya', '.'
    print('  %s %-9s zapisano %-5d vetvleniy %-3d  %s'
          % (mark, k, total, uses.get(k, 0), verdict))
    for f, ok, _ in ws:
        print('        %s %s' % ('+' if ok else '!', f))

print()
if stranded:
    print('  P  NE STROIT ZANOVO -- DOSTAVIT. Pisatel napisan i ne slit:')
    for k, fs in stranded:
        print('       %-9s %s' % (k, ', '.join(fs)))
    print('       Zdes rabota ne v kode, a v sliyanii.')
    print()
if unreached:
    print('  ?  PISATEL V PRODE, A ZAPISEY NET -- do nego ne dohodit upravlenie.')
    print('     Ishchi ne pisatelya, a PUT k nemu: risuetsya li knopka,')
    print('     vypolnyaetsya li uslovie, zovut li obrabotchik.')
    for k, fs, days in unreached:
        print('       %-9s %2d dn v prode: %s' % (k, days, ', '.join(fs)))
    print()
if dead:
    print('  X  NIKTO NIGDE NE PISHET, a logika chitaet: %s' % ', '.join(dead))
    print('     Vot eto -- nastoyashchaya rabota po kodu.')
    print()
if explained:
    print('  .  RAZOBRANO -- nol verniy, ne nahodka:')
    for k, why in explained:
        print('       %-9s %s' % (k, why))
    print()
if young:
    print('  .  SLISHKOM MOLODOY, chtoby sudit (< %d ch v prode):' % YOUNG_H)
    for k, h in young:
        print('       %-9s %.0f ch' % (k, h))
    print('     Ne nahodka. Vernis, kogda povod uzhe byl.')
    print()
if not (stranded or unreached or dead):
    print('  OK: u kazhdogo fakta est pisatel, on v prode, i on pishet')
sys.exit(1 if (dead or stranded or unreached) else 0)
PYBODY
