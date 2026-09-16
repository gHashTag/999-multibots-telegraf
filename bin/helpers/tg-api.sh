#!/bin/bash
# Справочник Bot API под рукой: tri api sendMessageDraft
#
# ЗАЧЕМ. Цикл по Telegram API 2026 года потратил заметную часть времени на
# вопрос «а как ТОЧНО называется поле». Ошибиться тут дорого: `disabled`
# вместе с `callback_data` — это два типа кнопки сразу, Telegram отвергает
# такую на каждом нажатии, а запасной путь делает отказ неотличимым от
# прежнего поведения. Такое ловится только чтением справочника.
#
# WebFetch в этих сессиях мёртв (псевдонимы моделей в настройках владельца
# указывают на glm, которых у аккаунта нет), поэтому берём страницу curl-ом
# один раз и держим в кэше.
set -u

CACHE="${1:?нужен каталог кэша}"
NAME="${2:-}"
if [ -z "$NAME" ]; then
  echo 'tri api <метод или класс>, например: tri api sendMessageDraft'
  echo 'tri api --refresh   перекачать справочник'
  exit 2
fi

mkdir -p "$CACHE"
SRC="$CACHE/telegram-api.txt"
[ "$NAME" = "--refresh" ] && rm -f "$SRC"

if [ ! -s "$SRC" ]; then
  echo "— качаю справочник Bot API (один раз) —" >&2
  curl -sL --max-time 60 https://core.telegram.org/bots/api -o "$CACHE/api.html" ||
    { echo "справочник не скачался"; exit 1; }
  API_HTML="$CACHE/api.html" API_TXT="$SRC" python3 - <<'PY'
import re, io, os, html
s = io.open(os.environ['API_HTML'], encoding='utf-8', errors='replace').read()
s = re.sub(r'(?is)<(script|style)[^>]*>.*?</\1>', ' ', s)
s = re.sub(r'(?i)<h4[^>]*>', '\n\n#### ', s)
s = re.sub(r'(?i)</tr>', '\n', s)
s = re.sub(r'(?i)</td>', ' | ', s)
s = re.sub(r'(?i)<(li|p)[^>]*>', '\n', s)
s = re.sub(r'<[^>]+>', ' ', s)
s = html.unescape(s)
s = re.sub(r'[ \t]+', ' ', s)
io.open(os.environ['API_TXT'], 'w', encoding='utf-8').write(s)
PY
  rm -f "$CACHE/api.html"
fi
[ "$NAME" = "--refresh" ] && { echo "справочник обновлён: $SRC"; exit 0; }

API_TXT="$SRC" API_NAME="$NAME" python3 - <<'PY'
import io, os, sys
s = io.open(os.environ['API_TXT'], encoding='utf-8').read()
name = os.environ['API_NAME']
i = s.find('#### ' + name + ' ')
if i < 0:
    # Имена в справочнике чувствительны к регистру, но человек — нет.
    low = s.lower()
    i = low.find('#### ' + name.lower() + ' ')
if i < 0:
    print('не нашёл «%s».' % name)
    hits = [
        l.strip()[5:].strip()
        for l in s.split('\n')
        if l.startswith('#### ') and name.lower() in l.lower()
    ]
    if hits:
        print('похожее: ' + ', '.join(hits[:12]))
    sys.exit(1)
print(s[i:i + 2500].rstrip())
PY
