#!/bin/bash
# tri spelling — тесты, которые сторожат НАПИСАНИЕ исходника, а не свойство.
#
# ЗАЧЕМ (форма 87). Сторож «лид едет вместе с черновиком» был устроен так:
# прочитать telegram-tools.ts, найти предложение-отказ и проверить регулярным
# выражением двести знаков после него. Прямо над этой строкой в нём написано:
# «сторожим свойство, а не то, что вызван этот помощник».
#
# 17.09.2026 вызов переехал в переменную — поведение не изменилось ни на байт —
# и сторож покраснел. Но дороже другая половина: он остался бы ЗЕЛЁНЫМ, если бы
# написание уцелело, а свойство исчезло. Ловит переименование, пропускает
# подмену.
#
# ЧТЕНИЕ ИСХОДНИКА БЫВАЕТ ЗАКОННЫМ — там, где свойство иначе не наблюдаемо:
# порядок веток в case, наличие маркера в промпте, отсутствие ключа в файле.
# Поэтому команда печатает КАНДИДАТОВ и то, на что они смотрят, а решает
# человек. Ни одного теста она не трогает.
set -u
ROOT="${1:?нужен корень репозитория}"
cd "$ROOT" || exit 1

# РЕЖИМ ЧЕРЕЗ ОКРУЖЕНИЕ. У python, читающего скрипт из heredoc, argv пуст:
# флаги, переданные ЭТОМУ файлу, до него не доходят. Первая версия молча
# игнорировала --gate и печатала обычный вывод с кодом 0 — то есть ворота
# были бы всегда зелёными.
SPELL_MODE="${2:-}" python3 - <<'PYEOF'
import json, os, re, subprocess, sys

files = subprocess.run(['git', 'ls-files', '*.test.ts', '*.spec.ts'],
                       capture_output=True, text=True).stdout.split()
if not files:
    print('🛑 git не отдал ни одного файла тестов — вывода НЕ делаю.')
    sys.exit(2)

# ТОЛЬКО ЧТЕНИЕ НАШЕГО ЖЕ КОДА.
#
# Первая версия ловила любой readFileSync и выдала 717 совпадений в 480
# файлах: тесты читают css, nginx.conf, промпты, json — и это законно, там
# файл и есть предмет проверки. Форма 87 — про другое: тест читает ИСХОДНИК
# на TypeScript, чтобы посмотреть, как там что написано.
READ = re.compile(
    r'readFileSync[^)]*\.tsx?[\'"]|readFileSync[^)]*[\'"][^\'"]*/(src|services|agent)/'
)
ASSERT = re.compile(r'\b(toMatch|toContain|toEqual|not\.toMatch|not\.toContain)\b')
IT = re.compile(r"^\s*(it|test)\s*\(\s*['\"`](.+?)['\"`]")

rows = []
for f in files:
    try:
        lines = open(f, encoding='utf-8').read().splitlines()
    except Exception:
        continue
    reads = [i for i, l in enumerate(lines) if READ.search(l)]
    if not reads:
        continue
    for i in reads:
        # Имя ближайшего теста ВЫШЕ чтения: так строка отчёта называет то,
        # что человек будет открывать.
        name = '(вне it)'
        for j in range(i, max(-1, i - 60), -1):
            m = IT.match(lines[j])
            if m:
                name = m.group(2)[:58]
                break
        # На что смотрит: первая проверка в пределах 25 строк после чтения.
        claim = ''
        for k in range(i, min(len(lines), i + 25)):
            if ASSERT.search(lines[k]):
                claim = lines[k].strip()[:74]
                break
        # Без проверки рядом это просто чтение файла — предмета для разговора
        # нет, и печатать его значит топить настоящие находки.
        if claim:
            rows.append((f, i + 1, name, claim))

if not rows:
    print('✅ ни один тест не читает исходник — сторожей за буквами нет.')
    sys.exit(0)

# ДВА РАЗНЫХ ЗВЕРЯ, И СМЕШИВАТЬ ИХ НЕЛЬЗЯ.
#
# `not.toMatch(/onSkip|onLater/)` — проверка ОТСУТСТВИЯ. Наблюдать отсутствие
# свойства иначе почти невозможно: нечего вызвать, нечего прочитать в ответе.
# Такие сторожа законны, и гнать их в общий список значит утопить настоящие.
#
# `toContain('удалитьСвоёФото(pool,')` — слежка за ВЫЗОВОМ. Результат этого
# вызова наблюдаем: очередь, ответ, строка в базе. Вот здесь форма 87.
ABSENCE = re.compile(r'\bnot\.(toMatch|toContain)\b')
# СКОБКА ПОСЛЕ СЛОВА — ЕЩЁ НЕ ВЫЗОВ.
#
# Первая версия считала вызовом всё, где перед скобкой стоит слово, и записала
# в подозрительные toContain('if (parsedModel)') — это УСЛОВИЕ. Ключевые слова
# языка известны наперечёт, и этого хватает, чтобы список перестал врать.
KEYWORD = re.compile(r"(if|for|while|switch|catch|return|typeof)\s*\(")
CALLISH = re.compile(r"toContain\(\s*['\"`][^'\"`]*\(")

legit, suspect, other = [], [], []
for row in rows:
    claim = row[3]
    (legit if ABSENCE.search(claim)
     else other if KEYWORD.search(claim)
     else suspect if CALLISH.search(claim)
     else other).append(row)

print(f'тестов, читающих наш же исходник: {len(rows)}')
print(f'  из них проверяют ОТСУТСТВИЕ (законно): {len(legit)}')
print(f'  смотрят на ВЫЗОВ в тексте (форма 87):  {len(suspect)}')
print(f'  прочее, решать глазами:                {len(other)}')
print()
# ── БАЗА ИЗВЕСТНОГО ДОЛГА ─────────────────────────────────────────────────
#
# Восемь сторожей, следящих за написанием, существуют. Требовать их починки
# одним движением — значит остановить работу всем и получить выключенные
# ворота к обеду. Поэтому как у orphan-events: база фиксирует нынешнее, а
# падают ворота только на НОВЫХ.
#
# Смысл не в том, чтобы долг уменьшался сам, а в том, чтобы он не рос молча.
# ОТНОСИТЕЛЬНО КОРНЯ, В КОТОРЫЙ СКРИПТ УЖЕ ПЕРЕШЁЛ.
#
# Считать путь от `__file__` здесь нельзя: у python, читающего скрипт из
# heredoc, это `<stdin>`, и abspath дал `/Users/scripts/...` — каталог, где
# базы нет и быть не может.
BASE = os.path.join('scripts', 'spelling-baseline.json')
key = lambda r: f'{r[0]}:{r[2]}'

MODE = os.environ.get('SPELL_MODE', '')

if MODE == '--update-baseline':
    with open(BASE, 'w', encoding='utf-8') as fh:
        json.dump(sorted(key(r) for r in suspect), fh, ensure_ascii=False, indent=2)
        fh.write('\n')
    print(f'база обновлена: {len(suspect)} записей → {BASE}')
    sys.exit(0)

if MODE == '--gate':
    try:
        with open(BASE, encoding='utf-8') as fh:
            known = set(json.load(fh))
    except Exception:
        print('🛑 базы нет или она не читается — судить НЕ берусь.')
        print(f'   Создать: tri spelling --update-baseline  ({BASE})')
        sys.exit(2)
    fresh = [r for r in suspect if key(r) not in known]
    gone = len(known) - (len(suspect) - len(fresh))
    print(f'сторожа за буквами: {len(suspect)}; в базе: {len(known)}')
    if gone > 0:
        print(f'  ✅ починено с прошлого раза: {gone}. Обновите базу:'
              ' tri spelling --update-baseline')
    if not fresh:
        print('  ✅ новых не появилось.')
        sys.exit(0)
    print(f'  🛑 НОВЫЕ сторожа за написанием: {len(fresh)}')
    for f, ln, name, claim in fresh:
        print(f'     {f}:{ln}  «{name}»')
        print(f'        {claim}')
    print()
    print('  Результат такого сторожа наблюдаем: очередь, ответ, строка в базе.')
    print('  Проверяйте его, а не текст исходника — иначе он краснеет на')
    print('  переименовании и молчит на подмене (форма 87).')
    sys.exit(1)

if suspect:
    print('── СМОТРЯТ НА ВЫЗОВ: результат наблюдаем, значит сторожат буквы ──')
    for f, ln, name, claim in suspect:
        print(f'  {f}:{ln}')
        print(f'    «{name}»  →  {claim}')
    print()
if other:
    print('── ПРОЧЕЕ (не приговор: бывает и порядок веток, и маркер в промпте) ──')
    for f, ln, name, claim in other[:12]:
        print(f'  {f}:{ln}  {claim}')
    if len(other) > 12:
        print(f'  … и ещё {len(other) - 12}')
    print()
print('  Законно там, где свойство ИНАЧЕ не наблюдаемо: порядок веток в case,')
print('  маркер в промпте, отсутствие ключа в файле.')
print('  Незаконно, когда рядом есть наблюдаемый результат: очередь, ответ,')
print('  запись в базе. Проверка: мутация, ломающая свойство и НЕ трогающая')
print('  написание. Выжила — сторож смотрит на буквы (форма 87).')
PYEOF
