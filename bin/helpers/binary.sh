#!/bin/bash
# tri binary — файлы исходников, которые grep считает ДВОИЧНЫМИ.
#
# ЗАЧЕМ (форма 35, и она стоила мне двадцати минут СЕГОДНЯ). Один байт 0x00
# в `render/src/agent/tools.ts` — разделитель хеша, записанный байтом вместо
# escape-последовательности — делает весь файл двоичным. `grep -rn` молча
# пропускает его целиком.
#
# 16.09.2026 я искал, кто в проде подключает инструмент лид-магнита:
#
#     grep -rn "makeCrmDeliverTools" apps/.../src   →  только тест
#
# и записал «в проде не подключён вовсе». Неправда: подключён в строке 2749
# того самого файла, вместе с аватаркой лида. Вывод о продукте из молчания
# инструмента — ровно то, от чего заведён этот скилл.
#
# Пусто — хорошо. Не пусто — каждый найденный файл невидим для КАЖДОЙ
# проверки на shell в этом репозитории.
set -u
ROOT="${1:?нужен корень репозитория}"
cd "$ROOT" || exit 1

echo "── исходники, невидимые для grep ──"

# ПОИСК НУЛЯ — В PYTHON, А НЕ В grep.
#
# Первая версия искала `grep -qU $'\x00'` и объявила двоичными ВСЕ файлы: ноль
# внутри аргумента обрывает строку C, образец превращается в пустой и совпадает
# с чем угодно. Проверка, совпадающая всегда, — это та же слепота с другой
# стороны, и попалась она на первом же прогоне только потому, что следом шёл
# python, который не нашёл в файле ни одного нуля.
# СПИСОК ФАЙЛОВ БЕРЁТ САМ PYTHON.
#
# Труба в `python3 - <<EOF` не доходит до программы: heredoc И ЕСТЬ
# стандартный ввод, а список файлов из `git ls-files | ...` съедается им же.
# Сегодня это случилось В ТРЕТИЙ раз за смену (форма 42) и поймалось только
# собственной проверкой «прочитано файлов: 0 — подозрительно мало».
python3 - <<'PYRUN'
import io, subprocess, sys

try:
    out = subprocess.run(
        ['git', 'ls-files', '--', '*.ts', '*.tsx', '*.js', '*.mjs', '*.cjs',
         '*.json', '*.md', '*.sh'],
        capture_output=True, text=True, check=True).stdout
except Exception as e:
    sys.stderr.write('git ls-files did not run: %s\n' % e)
    raise SystemExit(2)

bad = 0
checked = 0
for path in out.split('\n'):
    path = path.strip()
    if not path or 'node_modules' in path:
        continue
    try:
        data = io.open(path, 'rb').read()
    except OSError:
        continue
    checked += 1
    i = data.find(b'\x00')
    if i < 0:
        continue
    bad += 1
    print('  BINARY %s' % path)
    print('     line %d, byte %d' % (data[:i].count(b'\n') + 1, i))

print()
print('  files read: %d' % checked)
if checked < 50:
    print('  too few files read -- is this a source repository?')
    raise SystemExit(2)
if bad == 0:
    print('  OK: every source file is readable by text tools')
    raise SystemExit(0)
print('  BLIND FILES: %d' % bad)
print('  Each is invisible to grep, and so to every shell-side guard.')
print('  Zero matches in such a file is the tool being silent, NOT a fact.')
print()
print('  Fix: write the byte as an escape -- the value is identical.')
print('  Read it meanwhile:  grep -a <pattern> <file>')
raise SystemExit(1)
PYRUN
