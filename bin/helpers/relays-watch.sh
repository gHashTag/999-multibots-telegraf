#!/bin/bash
# tri relays-watch run|install|status -- `tri relays` every hour, and a broken
# road is fixed where a fix is safe, then reported.
#
# WHY. Owner, 2026-10-03: "if any error happens the agent must react itself,
# fix the bug, report it and finish the task". For nine days every button tap
# in the CRM bot said "could not pass the answer on" and nobody measured it
# (relays.sh). A probe someone has to remember to run is the same silence.
#
# WHAT IT DOES, per run:
#   ok            -> silent; if the last run was broken, says it recovered.
#   not measured  -> one retry a minute later; reported only on the third
#                    unmeasured run in a row (Railway's CLI blinks).
#   render down   -> (approve/meeting answered 000 or 5xx) waits out a deploy
#                    swap and probes again; still down -> redeploys
#                    vibee-render itself, at most once per HEAL_EVERY_S, waits,
#                    probes, and reports what broke, what it did, the result.
#   anything else -> key parity, a public guard, 401/403: these are a secret or
#                    code, never touched unattended -- reported with the
#                    exact next step.
# A broken state is repeated at most every REPEAT_S, never every hour.
#
# Messages go to the owner from @t27ai_bot as plain text (no parse_mode: a
# Markdown message with RENDER_API_KEY in it is rejected by Telegram, and
# alert.sh's `>/dev/null` would have hidden that).
#
# Seams for the test: RELAYS_CMD, REDEPLOY_CMD, SEND_CMD, SLEEP_CMD, STATE_DIR,
# LAUNCHCTL.
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATE_DIR="${STATE_DIR:-$HOME/.local/state/t27-relays-watch}"
HEAL_EVERY_S="${HEAL_EVERY_S:-21600}"
REPEAT_S="${REPEAT_S:-21600}"
SWAP_WAIT_S="${SWAP_WAIT_S:-90}"
HEAL_WAIT_S="${HEAL_WAIT_S:-240}"
OWNER="${OWNER_CHAT:-144022504}"
LIB="$HOME/.local/lib/t27-relays-watch"
PLIST="$HOME/Library/LaunchAgents/ai.t27.relays-watch.plist"

relays() {
  if [ -n "${RELAYS_CMD:-}" ]; then eval "$RELAYS_CMD"; else bash "$HERE/relays.sh" 2; fi
}
pause() { ${SLEEP_CMD:-sleep} "$1"; }
send() {
  if [ -n "${SEND_CMD:-}" ]; then printf '%s' "$1" | eval "$SEND_CMD"; return; fi
  local tok
  tok=$(grep -E '^TELEGRAM_BOT_TOKEN=' "$HOME/.fcc/.env" 2>/dev/null | cut -d= -f2- | tr -d '"')
  [ -n "$tok" ] || { echo "relays-watch: no TELEGRAM_BOT_TOKEN in ~/.fcc/.env -- NOT sent" >&2; return 1; }
  curl -s -m 15 -X POST "https://api.telegram.org/bot${tok}/sendMessage" \
    --data-urlencode chat_id="$OWNER" --data-urlencode text="$1" |
    grep -q '"ok":true' || echo "relays-watch: Telegram refused the message" >&2
}
redeploy() {
  if [ -n "${REDEPLOY_CMD:-}" ]; then eval "$REDEPLOY_CMD"; return; fi
  . "$HERE/rail.sh"
  railway redeploy --project "$RAIL_PROJECT" --environment "$RAIL_ENV" \
    --service vibee-render --yes >/dev/null 2>&1
}

# down = the render did not answer at all; everything else needs a person.
kind_of() {
  if printf '%s\n' "$1" | grep -qE 'FAIL .*button\)?: (000|5[0-9][0-9]),'; then
    echo down
  else
    echo person
  fi
}
fails() { printf '%s\n' "$1" | grep -E '^ +FAIL ' | sed 's/^ *FAIL */- /'; }

get() { cat "$STATE_DIR/$1" 2>/dev/null || echo "${2:-}"; }
put() { printf '%s' "$2" >"$STATE_DIR/$1"; }

run() {
  mkdir -p "$STATE_DIR"
  local now out rc kind heal_note="" said
  now=$(date +%s)
  out=$(relays 2>&1); rc=$?

  if [ "$rc" = 2 ]; then
    pause 60; out=$(relays 2>&1); rc=$?
  fi
  if [ "$rc" = 2 ]; then
    local n=$(( $(get unmeasured 0) + 1 ))
    put unmeasured "$n"
    echo "relays-watch: not measured ($n in a row)"
    if [ "$n" = 3 ]; then
      send "⚠️ Проверка дорог бот → render не может измерить уже 3 часа подряд (Railway не отвечает CLI). Ничего не чинил: не знаю, что сломано. Вручную: tri relays" # cyrillic-ok
    fi
    return 2
  fi
  put unmeasured 0

  if [ "$rc" != 0 ]; then
    kind=$(kind_of "$out")
    if [ "$kind" = down ]; then
      pause "$SWAP_WAIT_S"; out=$(relays 2>&1); rc=$?
      [ "$rc" = 0 ] && echo "relays-watch: down for one probe, back after ${SWAP_WAIT_S}s (a deploy swap)"
    fi
    if [ "$rc" != 0 ] && [ "$(kind_of "$out")" = down ]; then
      if [ $(( now - $(get healed_at 0) )) -ge "$HEAL_EVERY_S" ]; then
        put healed_at "$now"
        if redeploy; then
          pause "$HEAL_WAIT_S"; out=$(relays 2>&1); rc=$?
          if [ "$rc" = 0 ]; then
            heal_note="Починил сам: перезапустил vibee-render, после перезапуска все дороги отвечают." # cyrillic-ok
          else
            heal_note="Перезапустил vibee-render — не помогло, дороги всё ещё не отвечают." # cyrillic-ok
          fi
        else
          heal_note="Пытался перезапустить vibee-render — Railway отказал в перезапуске." # cyrillic-ok
        fi
      else
        heal_note="Перезапуск render уже был меньше 6 ч назад — второй раз сам не делаю." # cyrillic-ok
      fi
    fi
  fi

  if [ "$rc" = 0 ]; then
    if [ "$(get state ok)" = broken ] || [ -n "$heal_note" ]; then
      send "✅ Дороги бот → render снова работают: кнопки «Разрешить» и карточки встреч доходят.${heal_note:+
$heal_note}" # cyrillic-ok
    fi
    put state ok
    echo "relays-watch: ok"
    return 0
  fi

  said="🔴 Кнопки бота не доходят до render — человек видит «Не смог передать ответ».
$(fails "$out")" # cyrillic-ok
  if [ -n "$heal_note" ]; then
    said+="
$heal_note"
  elif [ "$(kind_of "$out")" = person ]; then
    said+="
Сам не чиню: это ключ или код, а не упавший сервис. Следующий шаг: tri relays — строка FAIL скажет, что именно." # cyrillic-ok
  fi
  if [ "$(get state ok)" != broken ] || [ -n "$heal_note" ] ||
    [ $(( now - $(get told_at 0) )) -ge "$REPEAT_S" ]; then
    send "$said"
    put told_at "$now"
  fi
  put state broken
  echo "relays-watch: broken"
  return 1
}

# The watch runs under launchd's bare PATH, where `railway` may be a
# different, older CLI than the logged-in one in this shell (2026-10-03: 4.5.4
# at /usr/local/bin, "Unauthorized", every run "not measured"). So install pins
# the directory of the railway it finds here first on the job's PATH, and
# refuses to install a watch that could not measure anything.
install() {
  local rw bin path
  rw=$(command -v railway) || { echo "relays-watch: no railway on PATH -- not installed" >&2; return 1; }
  bin=$(dirname "$rw")
  path="$bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
  if ! env -i HOME="$HOME" PATH="$path" railway whoami >/dev/null 2>&1; then
    echo "relays-watch: $rw is not logged in under the job's PATH -- run railway login; not installed" >&2
    return 1
  fi
  mkdir -p "$LIB" "$HOME/Library/Logs" "$(dirname "$PLIST")" || return 1
  cp "$HERE/relays.sh" "$HERE/rail.sh" "$HERE/relays-watch.sh" "$LIB/" || return 1
  cat >"$PLIST" <<EOF || return 1
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key>
	<string>ai.t27.relays-watch</string>
	<key>ProcessType</key>
	<string>Standard</string>
	<key>ProgramArguments</key>
	<array>
		<string>/bin/bash</string>
		<string>$LIB/relays-watch.sh</string>
		<string>run</string>
	</array>
	<key>EnvironmentVariables</key>
	<dict>
		<key>PATH</key>
		<string>$path</string>
	</dict>
	<key>RunAtLoad</key>
	<true/>
	<key>StartInterval</key>
	<integer>3600</integer>
	<key>StandardOutPath</key>
	<string>$HOME/Library/Logs/t27-relays-watch.log</string>
	<key>StandardErrorPath</key>
	<string>$HOME/Library/Logs/t27-relays-watch.log</string>
</dict>
</plist>
EOF
  ${LAUNCHCTL:-launchctl} bootout "gui/$(id -u)/ai.t27.relays-watch" 2>/dev/null
  ${LAUNCHCTL:-launchctl} bootstrap "gui/$(id -u)" "$PLIST" && echo "relays-watch: installed, hourly, railway $rw, log ~/Library/Logs/t27-relays-watch.log"
}

status() {
  launchctl print "gui/$(id -u)/ai.t27.relays-watch" 2>/dev/null | grep -E 'state =|last exit code' | sed 's/^\s*/  /'
  echo "  state: $(get state unknown), unmeasured in a row: $(get unmeasured 0)"
  tail -5 "$HOME/Library/Logs/t27-relays-watch.log" 2>/dev/null | sed 's/^/  log: /'
}

case "${1:-run}" in
  run) run ;;
  install) install ;;
  status) status ;;
  *) echo "usage: tri relays-watch run|install|status" >&2; exit 2 ;;
esac
