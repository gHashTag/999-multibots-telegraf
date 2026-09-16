#!/bin/bash
# tri headroom — числа, которые рассказывают про ЗАПАС, а не про потери.
#
# ЗАЧЕМ (форма 54). Первая строка утреннего плана владельца говорила:
#
#     Сегодня ушло: 4 из 30.
#
# То есть «можно ещё двадцать шесть». А в те же дни продавец подготовил 63
# карточки, каждая сменяла прошлую ненажатую. Ограничение было не в лимите, а
# в том, что карточки умирают до нажатия, — и экран утверждал обратное каждое
# утро, первой строкой.
#
# Признак общий: «сделано N из лимита M» там, где M ни разу не достигался.
# Такая строка всегда рассказывает про запас и никогда — про потери.
#
# Это ТРИАЖ, а не приговор: команда собирает кандидатов, решает человек.
# Разобранное помечается строкой `headroom-ok: <чем закрыт>` рядом и больше
# не показывается — тот же протокол, что у `tri owners` и `tri promises`.
set -u
ROOT="${1:?нужен корень репозитория}"
cd "$ROOT" || exit 1

DIRS="src/services src/navigation apps/vibee-editor/render/src/agent"
echo "── числа про запас (а не про потери) ──"
echo

DIRS="$DIRS" python3 - <<'PYRUN'
import io, os, re, subprocess, sys

# NARROW ON PURPOSE. The first version matched "осталось", "лимит" and every
# balance remainder: 46 candidates of which 44 were ordinary and correct. A
# list where nearly all entries are fine is read once and then never again --
# the same failure as the first tri owners and the first tri lost.
#
# The shape of form 54 is specific: OUR OWN activity counted against a cap we
# set -- "ушло N из M", "отправлено N из M", "использовано N из M". A balance
# left over after a purchase is not that, and neither is a prompt-length
# limit: both describe the PERSON's resource, not our productivity.
PAT = re.compile(
    r'(ушло|отправлено|сделано|использовано|потрачено|обработано)'
    r'[^\n]{0,40}из \s*(\$\{|\d)',
    re.I,
)
CYR = re.compile(r'[А-Яа-яЁё]')
MARK = 'headroom-ok:'

files = []
for d in os.environ['DIRS'].split():
    if not os.path.isdir(d):
        continue
    for root, _dirs, names in os.walk(d):
        if 'node_modules' in root:
            continue
        for nm in names:
            if nm.endswith('.ts') and not nm.endswith('.test.ts'):
                files.append(os.path.join(root, nm))

open_n = 0
reviewed = 0
read = 0
for path in files:
    try:
        lines = io.open(path, encoding='utf-8', errors='replace').read().split('\n')
    except OSError:
        continue
    read += 1
    for i, line in enumerate(lines):
        if not PAT.search(line) or not CYR.search(line):
            continue
        stripped = line.strip()
        if stripped.startswith('//') or stripped.startswith('*'):
            continue
        # A marker on the line, or in the comment block directly above.
        if MARK in line:
            reviewed += 1
            continue
        j = i - 1
        found = False
        while j >= 0:
            t = lines[j].strip()
            if MARK in t:
                found = True
                break
            if t and not (t.startswith('//') or t.startswith('*') or t.startswith('/*')):
                break
            j -= 1
        if found:
            reviewed += 1
            continue
        open_n += 1
        print('  %s:%d' % (path, i + 1))
        print('     %s' % stripped[:110])

print()
print('  файлов прочитано: %d' % read)
if read < 20:
    print('  подозрительно мало файлов — это точно дерево исходников?')
    raise SystemExit(2)
print('  не разобрано: %d; разобрано ранее: %d' % (open_n, reviewed))
print()
if open_n == 0:
    print('  каждое число про запас разобрано')
    raise SystemExit(0)
print('  ВОПРОС К КАЖДОМУ: этот предел когда-нибудь достигался?')
print('  Если нет -- строка говорит про запас там, где надо говорить про потери.')
print('  Разобрал -- поставь рядом строку:  // headroom-ok: <чем закрыт>')
raise SystemExit(1)
PYRUN
