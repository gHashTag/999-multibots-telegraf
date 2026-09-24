#!/bin/bash
# Освободить место под сборку. Только РЕГЕНЕРИРУЕМОЕ.
#
# ПОЧЕМУ ЭТОТ СКРИПТ ВООБЩЕ ЕСТЬ. Диск на этой машине упирается в ноль каждые
# несколько сборок, и цикл вставал именно на этом — не на задаче. Чистка руками
# по три раза за смену съедала время, которое должно идти в работу.
#
# ЧЕГО ЭТОТ СКРИПТ НЕ ДЕЛАЕТ И НЕ ДОЛЖЕН.
#   ~/Movies, ~/Documents, ~/Downloads, ~/Library/Containers — файлы человека и
#   данные приложений. Удалить их «ради места» нельзя: восстановить неоткуда.
#   dist ВНУТРИ node_modules — это файлы пакетов, а не наша сборка. Снести их
#   значит сломать зависимости, а выглядит как безобидная чистка мусора.
set -u

# ИМЕНА ЛАТИНИЦЕЙ, и это единственное место, где кириллица не годится.
# `$(( после - до ))` — синтаксическая ошибка: в арифметическом контексте bash
# принимает только [A-Za-z_][A-Za-z0-9_]*. Скрипт падал на последних строках
# КАЖДЫЙ раз, а `$после` оставалась пустой — то есть порог «мало места», ради
# которого этот шаг и стоит первым, не срабатывал НИ РАЗУ. Сообщение об ошибке
# уезжало в хвост вывода, где его никто не читал.
free_before=$(df -k /System/Volumes/Data | awk '{if(NR==2)print $4}')

# 1. Кэши сборки: пересоздаются сами при следующем запуске.
rm -rf ~/Library/Developer/Xcode/DerivedData/* 2>/dev/null
rm -rf ~/Library/Developer/Xcode/Archives/* 2>/dev/null
rm -rf ~/Library/Caches/* 2>/dev/null
rm -rf ~/.npm/_cacache 2>/dev/null

# 2. Наши сборочные выходы — но НЕ те, что лежат в node_modules (см. выше).
# ИМЯ ПЕРЕМЕННОЙ ЦИКЛА — ЛАТИНИЦЕЙ, по той же причине, что и у арифметики
# выше: `for корень in …` даёт «not a valid identifier», цикл НЕ выполняется
# вовсе, и наши сборочные выходы не удалялись ни разу. Вчера я починил
# арифметику и не проверил остальной файл на тот же класс — ошибка печаталась
# в ПЕРВОЙ строке вывода, а я смотрел на последнюю.
for root in ~/999-multibots-telegraf ~/t27 ~/.vibee-worktrees; do
  [ -d "$root" ] || continue
  find "$root" -maxdepth 4 -type d \
    \( -name dist -o -name .next -o -name .turbo -o -name build-dev \) \
    -not -path '*/node_modules/*' -prune -exec rm -rf {} + 2>/dev/null
done

# 2-бис. КАТАЛОГ СБОРОК, КОТОРЫЙ СОЗДАЮ Я САМ.
#
# `-derivedDataPath /tmp/dd` — это мой рабочий каталог для сборок iOS, и за
# ночь он растёт на каждой сборке. Чистилка про него не знала и объявляла
# «регенерируемое кончилось» при 1676 МБ, имея под рукой 157 МБ своего же
# мусора. Диск в итоге забился ПОЛНОСТЬЮ — до состояния, когда не выполняется
# ни одна команда, включая эту чистилку.
#
# Каталог пересоздаётся следующей сборкой; ничего человеческого в нём нет.
rm -rf /tmp/dd 2>/dev/null
# СБОРКА iOS ЧЕРЕЗ run.sh КЛАДЁТ РЕЗУЛЬТАТ НЕ В /tmp/dd, А В build2.
#
# Найдено 07.09.2026, когда цикл встал на полном диске. Здесь чистился только
# /tmp/dd -- каталог, который использует `tri ios`. Но `run.sh` собирает в
# `apps/vibee-ios/build2`, и все ночные сборки шли через него: чистилка мимо
# них промахивалась, а знание об уборке жило в другой двери.
#
# Сам `run.sh` теперь чистит за собой перед сборкой; эта строка -- на случай,
# когда сборка упала посередине и до уборки дело не дошло.
rm -rf "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/apps/vibee-ios/build2" 2>/dev/null

# 2-трис. РАБОЧИЕ КОПИИ ВОРКФЛОУ — ТОЖЕ МОЙ МУСОР.
#
# Воркфлоу с изоляцией заводит `.claude/worktrees/<id>`; они должны убираться
# сами, но убираются не всегда. Замер: ДВЕНАДЦАТЬ оставшихся копий, 5,1 ГБ —
# больше, чем все кэши сборки вместе взятые, и чистилка про них не знала.
#
# Хуже, чем место: копии попадали в корневой прогон тестов. `bun run verify`
# шёл больше пятнадцати минут вместо ста секунд и падал красным — все двенадцать
# упавших файлов лежали в копии, ни один в коде. Единственная замена CI
# показывала поломку, которой нет.
#
# Удаляем ТОЛЬКО чистые: `git worktree remove` без `--force` сам откажется,
# если внутри есть несохранённые правки. Ветку удаление копии не трогает —
# проверено: после сноса всех двенадцати ветки на месте.
if [ -d ~/999-multibots-telegraf/.claude/worktrees ]; then
  git -C ~/999-multibots-telegraf worktree list --porcelain 2>/dev/null |
    grep '^worktree .*\.claude/worktrees' | cut -d' ' -f2 |
    while read -r tree; do
      git -C ~/999-multibots-telegraf worktree remove "$tree" 2>/dev/null
    done
  git -C ~/999-multibots-telegraf worktree prune 2>/dev/null
fi

# 3. Симуляторы НЕ трогаем.
#
# Здесь стояло `xcrun simctl delete unavailable`, и оно снесло устройство, на
# котором шла вся проверка приложения: «unavailable» у simctl означает не
# «мусор», а «рантайм сейчас не подхватился» — состояние временное, а удаление
# окончательное. Следующая сборка упала с «Unable to find a device matching the
# provided destination», и восстановление стоило дороже, чем освобождённые
# мегабайты.
#
# Место освобождает `~/Library/Developer/CoreSimulator/Caches` выше — он
# пересоздаётся сам и устройств не касается.

# 4. Docker, if it is here -- and ONLY if it answers.
#
# 2026-09-22: Docker Desktop stopped answering during the night and this line
# hung `tri doctor` for over eight minutes with no output: `docker system
# prune` waits for the daemon forever -- one from an earlier run was found
# still hanging after 3 h 12 min. macOS has no `timeout`, and perl's alarm
# does not work here: the docker CLI is Go, and Go ignores SIGALRM (measured:
# it killed `sleep`, not `docker`). So a watchdog sends SIGKILL. A daemon that
# does not answer `docker info` in 10 s is skipped with a note; the prune
# itself gets two minutes.
deadline() {
  local secs="$1"; shift
  "$@" &
  local pid=$!
  ( sleep "$secs"; kill -9 "$pid" 2>/dev/null ) &
  local dog=$!
  wait "$pid"; local rc=$?
  kill "$dog" 2>/dev/null; wait "$dog" 2>/dev/null
  return "$rc"
}
if command -v docker >/dev/null; then
  if deadline 10 docker info >/dev/null 2>&1; then
    deadline 120 docker system prune -af --volumes 2>/dev/null | tail -1 \
      || echo "docker: prune did not finish in 120 s -- skipped"
  else
    echo "docker: daemon does not answer -- skipped (restart Docker Desktop)"
  fi
fi

# ЧЕРНОВИКИ СЕССИЙ, КОТОРЫХ БОЛЬШЕ НЕТ.
#
# Каждая сессия Claude Code держит каталог в /private/tmp/claude-501: рабочие
# копии, снимки страниц, профили браузера. Живая сессия может занимать
# гигабайты законно, а мёртвая держит их ни за чем -- замерено 25.09.2026:
# 414 МБ у сессии, чьего процесса уже нет, при 1.3 ГБ свободных на диске.
#
# ЖИВОСТЬ ПРОВЕРЯЕТСЯ ПО ПРОЦЕССУ, а не по времени: сессия, молчавшая час,
# жива и её каталог трогать нельзя. `pgrep -f <id>` находит и сам процесс
# сессии, и её фоновые команды.
#
# И ОШИБАЕТСЯ ТОЛЬКО В БЕЗОПАСНУЮ СТОРОНУ. `-f` смотрит всю командную строку,
# поэтому любой процесс, где id просто УПОМЯНУТ, сойдёт за живую сессию:
# проверено -- запуск этой уборки командой, в которой написан чужой id, её
# каталог не тронул. Ошибка такого рода оставляет мусор на диске; обратная
# стёрла бы работающую сессию, и выбор здесь очевиден.
#
# И только после `git worktree prune`: в черновике может лежать рабочая
# копия, и удалить каталог мимо git значит оставить запись о копии, которой
# нет.
SCRATCH_ROOT=/private/tmp/claude-501
if [ -d "$SCRATCH_ROOT" ]; then
  freed_sessions=0
  for dir in "$SCRATCH_ROOT"/*/*/; do
    [ -d "$dir" ] || continue
    id=$(basename "$dir")
    # Идентификатор сессии -- uuid; каталоги вроде `chunks` пропускаем.
    case "$id" in
      ????????-????-????-????-????????????) ;;
      *) continue ;;
    esac
    # Своя сессия жива по определению: её каталог держит эту самую уборку.
    #
    # НО ЗАВИСШИЙ СНИМОК ЭКРАНА -- НЕ ЖИВАЯ СЕССИЯ. Замерено 24.09.2026:
    # три headless-процесса BrowserOS, каждый девять часов на одном кадре,
    # держали 1.6 ГБ черновиков сессии, которой давно нет. Каждый упоминает
    # её id в `--user-data-dir`, поэтому `pgrep -f` считал сессию живой и
    # уборка молча проходила мимо -- при 214 МБ свободных.
    #
    # Поэтому признаком жизни считается процесс, который НЕ является таким
    # вспомогательным. Остальное не меняется: ошибка по-прежнему возможна
    # только в безопасную сторону -- любой другой процесс с этим id спасает
    # каталог, а две проверки ниже спасают незакоммиченную работу.
    if pgrep -f "$id" | while read -r pid; do
         cmd=$(ps -o command= -p "$pid" 2>/dev/null)
         case "$cmd" in
           # The browser AND its renderer helpers: the helpers carry the same
           # --user-data-dir and no --headless of their own, so a rule written
           # against that flag saw three zombies as a living session.
           *BrowserOS*|*Google\ Chrome*|*chromium*|*Chromium*) ;;
           '') ;;
           *) echo alive; break ;;
         esac
       done | grep -q alive; then continue; fi
    # Рабочая копия внутри -- сначала сказать об этом git.
    # `git worktree list` from wherever this runs: the script is invoked from
    # the repository, and naming a variable that does not exist here would
    # check nothing at all -- quietly, which is the failure this guard is for.
    # РАБОЧАЯ КОПИЯ ВНУТРИ: снять её штатно, если терять нечего.
    #
    # Пропускать такой черновик -- то, что делала первая версия, -- значит
    # оставлять нетронутыми самые крупные: замерено 25.09.2026, мёртвая
    # сессия держала 2.3 ГБ при 486 МБ свободных, и уборка прошла мимо.
    #
    # «Терять нечего» проверяется ДВАЖДЫ, и обе проверки обязательны: в копии
    # нет несохранённых правок И её коммит есть на удалённом сервере. Копия с
    # неопубликованной работой не трогается никогда: диск дешевле чужого дня.
    if git worktree list 2>/dev/null | grep -q "$id"; then
      wt=$(git worktree list --porcelain | grep "^worktree .*$id" | head -1 |
           awk '{print $2}')
      dirty=$(git -C "$wt" status --short 2>/dev/null | head -1)
      head_sha=$(git -C "$wt" rev-parse HEAD 2>/dev/null)
      published=$(git branch -r --contains "$head_sha" 2>/dev/null | head -1)
      if [ -n "$dirty" ] || [ -z "$published" ]; then
        echo "  черновик $id: несохранённое или неопубликованное -- не трогаю"
        continue
      fi
      git worktree remove --force "$wt" >/dev/null 2>&1 || {
        echo "  черновик $id: git не отдал копию -- не трогаю"
        continue
      }
    fi
    size=$(du -sk "$dir" 2>/dev/null | awk '{print $1}')
    [ "${size:-0}" -lt 10240 ] && continue
    rm -rf "$dir" 2>/dev/null && freed_sessions=$(( freed_sessions + size ))
  done
  [ "$freed_sessions" -gt 0 ] &&
    echo "черновики мёртвых сессий: $(( freed_sessions / 1024 )) МБ"
fi

free_after=$(df -k /System/Volumes/Data | awk '{if(NR==2)print $4}')
echo "освобождено: $(( (free_after - free_before) / 1024 )) МБ · свободно: $(( free_after / 1024 )) МБ"

# Порог осмысленной сборки. Ниже — чинить нечем, нужны файлы человека.
if [ "$free_after" -lt 2097152 ]; then
  echo "МАЛО МЕСТА: под сборку нужно ~2 ГБ. Регенерируемое кончилось."
  # НАЗЫВАЕМ, ЧТО ЗАНЯТО, а не только отказываем. Ночью я упёрся в ноль и
  # советовал человеку удалять вслепую; на деле почти всё место держали
  # образы симуляторов, а не файлы человека.
  echo "Крупное на диске (посмотреть ПРЕЖДЕ чем удалять):"
  du -sk ~/Library/Developer/CoreSimulator/Devices ~/Movies ~/Downloads \
     ~/Library/Caches 2>/dev/null | sort -n | tail -4 |
    awk '{printf "  %5d МБ  %s\n", $1/1024, $2}'
  echo "Лишние устройства симулятора: xcrun simctl list devices"

  # РАБОЧИЕ КОПИИ, ПОИМЁННО И С РАЗМЕРОМ.
  #
  # Каждая -- полная выписка репозитория: замерено 25.09.2026, от 300 до 700
  # МБ штука, шесть штук у одной живой сессии составляли 3 ГБ из 4.1. Это не
  # мусор и удалять их за хозяина нельзя; но пока цена не названа, она
  # становится видимой только когда диск подходит к нулю -- то есть трижды
  # за ночь.
  echo "Рабочие копии (каждая -- полный репозиторий):"
  git worktree list --porcelain 2>/dev/null | grep '^worktree ' |
    awk '{print $2}' | while read -r w; do
      [ "$w" = "$(git rev-parse --show-toplevel 2>/dev/null)" ] && continue
      sz=$(du -sk "$w" 2>/dev/null | awk '{print $1}')
      [ -z "$sz" ] && continue
      printf "  %5d МБ  %s\n" "$((sz / 1024))" "$w"
    done
  exit 1
fi
