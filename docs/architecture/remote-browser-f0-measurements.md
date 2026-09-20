# Ф0 — сырые замеры, 2026-09-20

Стенд: Apple M1, Docker Desktop (linux VM 8 vCPU / 3.83 GiB).
Скрипты: measure.sh, measure-neko2.sh, inspect-neo-mcp.sh — рядом с этим файлом.

ВАЖНО О ТОЧНОСТИ. Замеры neo сняты под эмуляцией x86 на arm64: время старта и
CPU там завышены кратно и годятся только как «порядок». Chromium и neko меряны
нативно на arm64 — эти числа настоящие. Память под эмуляцией тоже слегка
завышена (кэш трансляции).

Методическая находка: headful Chromium ИГНОРИРУЕТ --remote-debugging-address и
слушает CDP только на loopback. Опубликованный наружу порт молчит при живом
контейнере. Все зонды поэтому идут через docker exec изнутри.

## A. Chromium + Xvfb, debian:bookworm-slim, arm64 (нативно)

    image_size        1.11GB
    cold_start_ms     1560                  # docker run -> CDP отвечает
    browser           Chrome/153.0.8010.52

    idle:    docker_mem 215.2MiB   cpu 1.39%   processes 16   profile_mb 4
             rss_sum_mb 1113                   # завышено: 16 процессов делят память

    5 сайтов (ru.wikipedia, github, telegram.org, ya.ru, youtube):
             docker_mem 729.7MiB   cpu 79.15%  processes 23   profile_mb 65
             rss_sum_mb 2476
             open_pages 6

## B. neko (ghcr.io/m1k1o/neko/chromium), arm64 (нативно, чистый прогон)

    image_size        2.2GB
    cold_start_ms     9477                  # http 8080 отвечает

    без единого зрителя:
      t+15s  mem 799.9MiB  cpu 1.85%
      t+30s  mem 789.8MiB  cpu 6.05%
      t+45s  mem 742.5MiB  cpu 0.11%
      t+60s  mem 743.0MiB  cpu 5.45%
      rss_sum_mb 1296      processes 24

    Внутри: 11 chromium, neko (Go), openbox, pulseaudio, supervisord, dbus.

    ВЫВОД: видеокодер в простое НЕ молотит. Первый прогон показал cpu 228% —
    это был шум от эмулированного соседа, перемер начисто его не подтвердил.
    Цена «человек видит и трогает браузер во вкладке»: +528 МиБ и +8 с старта
    против голого Chromium.

## C. BrowserOS neo .deb — содержимое пакета

    Package      browserclaw       Version 151.0.8162.137 (Chromium 151)
    Architecture amd64             Provides www-browser, gnome-www-browser
    Depends      libc6 (>= 2.31), libglib2.0-0, libnss3, libnspr4, libx11-6,
                 libatk1.0-0, libatk-bridge2.0-0, libcups2, libasound2,
                 libdrm2, libgbm1, libpango, libcairo2, libudev1,
                 libxcomposite1, libxdamage1, libxrandr2, libxkbcommon0,
                 libgtk-3-0
    Бинарник     /usr/bin/browserclaw
    MCP-сервер   /usr/lib/browserclaw/BrowserClawServer/default/resources/bin/
                 browseros-claw-server            (29 МБ)
    Ещё          2 вшитых .crx, chromedriver, chrome_sandbox, apparmor-профиль

## D. neo под Xvfb, debian:bookworm-slim, amd64 ПОД ЭМУЛЯЦИЕЙ

    image_size        1.9GB                 # build 190.7s
    cold_start_ms     51065   [эмуляция]
    browser           Chrome/151.0.8162.137 # браузер РАБОТАЕТ

    idle:    docker_mem 1004MiB   cpu 600.88% [эмуляция]  processes 18  profile_mb 10
    5 сайтов: docker_mem 1.963GiB cpu 369.60% [эмуляция]  processes 25  profile_mb 44

    mcp_port_9010     нет
    mcp_port_9200     нет

    ПРИЧИНА, установлена точно:

      browseros-claw-server: /lib/x86_64-linux-gnu/libc.so.6:
        version `GLIBC_2.38' not found
        version `GLIBC_2.39' not found

    В bookworm glibc 2.36. Пакет при этом ЗАЯВЛЯЕТ libc6 (>= 2.31) — то есть
    зависимость в .deb указана неверно. Браузер поднимается (10 процессов,
    CDP отвечает), MCP-сервер не стартует вовсе.

## E. neo на ubuntu:24.04 (glibc 2.39)

    ldd (Ubuntu GLIBC 2.39-0ubuntu8.9) 2.39
    browseros-claw-server --help   -> отвечает нормально

    Значит сломана декларация зависимостей в .deb, а не сам сервер. Довести
    до «MCP слушает порт» не удалось: под эмуляцией на этой базе упал сам
    браузер. Вопрос недоказан в обе стороны.

## G. Под «один браузер, два пульта» (deployment/remote-browser), arm64

    neko http 8080                 200
    CDP внутри                     Chrome/151.0.7922.71
    CDP снаружи                    недоступен  (порт не публикуется)
    --bwsi                         убран, профиль сохраняется
    агент открыл вкладку по CDP    появилась в том же браузере
    /api/room/screen/shot.jpg      показывает страницу, открытую агентом
    mem 471.6MiB  cpu 4.86%        (через ~20 с после старта)

## F. WebVM / CheerpX — Linux в браузере (webvm.io, Debian)

    nproc             1
    free -m total     700
    awk 3e6 итераций  real 4.086s   user 1.100s
    то же на M1       real 0.408s   user 0.190s
    => ~10x по wall-clock, ~5.8x по user

    Есть и графический вариант (Alpine/Xorg/i3), сеть через Tailscale.
    Но 700 МБ на всю машину меньше, чем Chromium просит в покое (215 МиБ,
    16 процессов), и втрое меньше, чем под нагрузкой (730 МиБ). Браузер
    внутрь не помещается — упрётся в память раньше, чем в скорость.

## H. Прокси /live/:sessionId против настоящего пода, 2026-09-20

    ok  token in the query is answered with a redirect
    ok  the redirect sets an HttpOnly cookie
    ok  the redirect location carries no token
    ok  the page comes through the proxy
    ok  it is neko's page
    ok  a relative asset resolves through the proxy   -- js/app.48a1d8f5.js
    ok  the websocket upgrades                        -- status 101
    ok  no cookie, no entry                           -- 401
    ok  a wrong token is refused                      -- 404
    ok  the websocket is refused without the cookie

    Скрипт: scripts/browser-live-e2e.ts

## I. Почему сначала не было картинки

    ICE connection state changed: failed
    peer connection state changed: failed
    undeclaredMediaProcessor failed to open SrtpSession: the DTLS transport
      has not started yet
    Failed to start SCTP: DTLS not established

    Под объявлял кандидатов на адресе контейнера. Лечится в драйвере:
    NEKO_WEBRTC_UDPMUX/TCPMUX + NAT1TO1 + публикация порта тем же номером.
    После правки — «Подключено» и поток рабочего стола.

## J. Как neko получает свой пароль (измерено по бандлу и логам)

    Страница:  new WebSocket(`${url}?password=${...}&username=${...}`)
    Под:       сам зовёт свой /api/login, в логе agent=Go-http-client,
               module=legacy
    Значит подменять надо строку запроса апгрейда, а не тело POST.
    neko вычищает pwd из адреса через replaceState -> после перезагрузки
    форма пароля возвращается, параметры нужны на каждую загрузку документа.

## K. Профиль переживает перезапуск, 2026-09-20

    ok  the first visit happened
        (stopped gracefully, container removed)
    ok  THE BROWSER STATE SURVIVED into a brand new container
        -- matches in History: 2
    ok  the cookie store came with it
    ok  a different profile knows nothing about this person's browsing
        -- matches: 0
    ok  wiping the profile removes the disk

    Скрипт: scripts/browser-profile-check.ts
    Свидетель — собственная History Chromium: CDP слушает loopback ВНУТРИ
    контейнера (публикация 9222 бесполезна), а кука потребовала бы интернета.
    Остановка мягкая: docker stop -t 15, затем rm. rm -f это SIGKILL, и
    Chromium тогда не дописывает куки на диск.

## L. Ловушка разбора, стоившая ложного FAIL

    grep -c при нуле совпадений выходит с кодом 1 -> срабатывает `|| echo 0`
    -> на выходе ДВЕ строки "0" -> Number("0\n0") = NaN -> NaN === 0 ложно.
    Контрольная проверка показала FAIL при фактическом нуле.
    Брать первую строку.
