/**
 * Setup-файл для vitest: ловит НАСТОЯЩИЕ сетевые вызовы в тестах.
 *
 * Зачем. `saveVideoUrlToSupabase.test.ts` ходил в сеть по-настоящему: не была
 * заглушена функция зеркалирования, которая скачивает файл по адресу из
 * аргумента. Проверки проходили только потому, что адрес не существует и
 * скачивание падает — то есть тест зависел от того, что сеть ОТКАЖЕТ. Отсюда
 * «зелёный со второго раза» в npm run test:gate.
 *
 * Единичный флак обесценивает проверку постепенно: если часть красного
 * считается шумом, «регрессий нет» перестаёт что-либо значить.
 *
 * Запуск:
 *   npx vitest run --setupFiles scripts/detect-network-tests.mjs 2>&1 | grep СЕТЬ
 *
 * Ничего не чинит и не меняет — только печатает, кто ходит в сеть.
 */
import fs from 'fs'
import http from 'http'
import https from 'https'

const OUT = process.env.NETWORK_LOG || '/tmp/vitest-network.log'
const OUT_MARK = OUT + '.mark'
const realFetch = globalThis.fetch

// Отметка загрузки. Без неё «ноль сетевых вызовов» неотличимо от «файл не
// подключился» — а он и не подключался: сначала флаг --setupFiles не
// применялся, потом сам файл падал на обращении к константе до её
// объявления. Оба раза отчёт показывал ноль.
try {
  fs.appendFileSync(OUT_MARK, 'ЗАГРУЖЕН\n')
} catch {
  /* пусто */
}

// ПИШЕМ В ФАЙЛ, А НЕ В КОНСОЛЬ. Первая версия печатала через console.log — и
// показала ноль вызовов даже там, где сеть заведомо была: vitest прячет вывод
// проходящих тестов. Ноль без самопроверки ничего не значит, и здесь это
// подтвердилось ещё раз.
/**
 * TWO CLIENTS, NOT ONE.
 *
 * The first version hooked `fetch` alone, and reported "no test reaches the
 * network" while axios went straight past it. In Node axios does not use fetch;
 * it uses the http/https transport, so its traffic was invisible here. axios is
 * the dominant client in this repository, so the observer's silence meant
 * blindness to the client the code actually uses, not quiet on the wire.
 *
 * Measured with a probe: a test making one call of each kind produced a single
 * log line out of two. Both channels are wrapped now; http.get and https.get
 * call request internally, so wrapping request is enough.
 */
for (const mod of [http, https]) {
  const realRequest = mod.request
  mod.request = (...args) => {
    let url = ''
    try {
      const a = args[0]
      url =
        typeof a === 'string'
          ? a
          : a instanceof URL
            ? a.href
            : `${a?.protocol ?? ''}//${a?.hostname ?? a?.host ?? ''}${
                a?.port ? ':' + a.port : ''
              }${a?.path ?? ''}`
    } catch {
      /* empty: the log is auxiliary, never fail a test over it */
    }
    try {
      fs.appendFileSync(OUT, `СЕТЬ → ${url.slice(0, 120)}\n`)
    } catch {
      /* empty: the log is auxiliary, never fail a test over it */
    }
    return realRequest(...args)
  }
}

globalThis.fetch = async (...args) => {
  const url = String(args[0]?.url ?? args[0] ?? '')
  try {
    fs.appendFileSync(OUT, `СЕТЬ → ${url.slice(0, 120)}\n`)
  } catch {
    /* пусто: журнал вспомогательный, ронять тесты из-за него нельзя */
  }
  return realFetch(...args)
}
