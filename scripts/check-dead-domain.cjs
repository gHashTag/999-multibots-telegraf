#!/usr/bin/env node
/**
 * Не даёт мёртвому хосту вернуться в исполняемый код.
 *
 * ИСТОРИЯ. Проверка была написана под ОДИН домен — three-head-dragon.shop
 * (старый сервер 188.137.250.69, с которого проект переехал на Railway). Он
 * стоял fallback'ом в платёжной цепочке Robokassa и в адресах коллбэков.
 * Список вычистили, ворота включили, всё честно.
 *
 * А через несколько месяцев ТОТ ЖЕ класс дефекта вернулся с другой площадки:
 * проект ушёл ещё и с fly.io, а в коде осталось 18 упоминаний семи хостов
 * *.fly.dev. Проверка их не видела по двум причинам, и обе — про неё саму:
 *
 *   1. знала ровно одно имя, а не КЛАСС «площадка, с которой мы ушли»;
 *   2. обходила только src/ — весь apps/ (мини-апп и рендер) был невидим,
 *      а именно там и лежала половина находок.
 *
 * Замерено 24.08.2026 запросом по каждому хосту: живых нет ни одного.
 *   vibee-telegram-bridge.fly.dev  NXDOMAIN
 *   vibee-player.fly.dev           NXDOMAIN
 *   остальные пять                 DNS есть, HTTP 000 — соединение не встаёт
 *
 * Цена молчания была не теоретической: адрес плеера подставлялся В ТЕКСТ
 * поста как ссылка «смотреть ленту», а мост в Telegram-канал не существовал
 * вовсе — при этом публикация отвечала success:true.
 *
 * Упоминания в комментариях разрешены: без них следующий читатель не поймёт,
 * почему хоста нет.
 */
const fs = require('fs')
const path = require('path')

/**
 * Мёртвые хосты. Добавлять сюда, а не заводить вторую проверку: один и тот же
 * класс должен ловиться одним инструментом, иначе следующая площадка снова
 * проедет мимо.
 */
const DEAD = [
  'three-head-dragon.shop', // старый сервер 188.137.250.69
  '.fly.dev', // площадка, с которой ушли на Railway; проверено — живых нет
]

const REPO = path.resolve(__dirname, '..')
// Обходим ОБА дерева. Раньше был только src/, и apps/ не проверялся вовсе.
const ROOTS = ['src', 'apps'].map(d => path.join(REPO, d)).filter(fs.existsSync)

const hits = [] // зашито без альтернативы — исполняется всегда
const soft = [] // последний fallback после env — в проде не берётся

function scan(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      // dist и .next — сборка, там чинить нечего; e2e гоняется своим раннером
      if (
        !/node_modules|[/\\]e2e([/\\]|$)|__tests__|[/\\]dist[/\\]?$|\.next/.test(
          p
        )
      )
        scan(p)
      continue
    }
    if (!/\.(ts|tsx|js|mjs|cjs)$/.test(p)) continue
    // Сам этот файл перечисляет мёртвые хосты по назначению.
    if (path.resolve(p) === path.resolve(__filename)) continue

    const arr = fs.readFileSync(p, 'utf8').split('\n')
    arr.forEach((line, i) => {
      const dead = DEAD.find(d => line.includes(d))
      if (!dead) return
      const code = line.trim()
      // комментарий — не нарушение
      if (
        code.startsWith('//') ||
        code.startsWith('*') ||
        code.startsWith('/*')
      )
        return
      // Explicit opt-out marker for DELIBERATE mentions — for instance in a
      // detector that warns the webhook points at a dead host. Written as a
      // comment above the line.
      //
      // The WHOLE contiguous comment block above is inspected, not just the
      // single preceding line. The old check broke on formatting: prettier
      // moved a long argument onto its own line, or split an explanation in
      // two, and a legitimate marker silently stopped working while the gate
      // failed on code nobody had changed. Verified on this very file.
      let hasMarker = false
      for (let j = i - 1; j >= 0; j--) {
        const above = (arr[j] || '').trim()
        if (above.includes('dead-domain-ok')) {
          hasMarker = true
          break
        }
        // Продолжаем только по комментариям и открывающим скобкам вызова —
        // строка кода со смыслом обрывает блок.
        if (
          !(
            above.startsWith('//') ||
            above.startsWith('*') ||
            above.startsWith('/*') ||
            above.endsWith('(')
          )
        )
          break
      }
      if (hasMarker) return
      /**
       * Отличаем ОПАСНОЕ от инертного.
       *
       * Инертное — хост как последний fallback после переменной окружения:
       *   process.env.PUBLIC_URL || 'https://vibee-render-server.fly.dev'
       * В проде переменная задана, ветка не берётся. Неправильно, но сегодня
       * никого не задевает.
       *
       * Опасное — хост без всякой альтернативы: исполняется всегда. Именно так
       * были сломаны коллбэк AI Reels, ссылки статуса lipsync и публикация
       * ролика в канал.
       */
      const isFallback = /\|\||\?\?|\?\s*[`'"]|:\s*[`'"]/.test(code)
      const loc = `${path.relative(REPO, p)}:${i + 1}`
      ;(isFallback ? soft : hits).push(
        `${loc}  [${dead}]  ${code.slice(0, 84)}`
      )
    })
  }
}
ROOTS.forEach(scan)

// Знаменатель обязателен: пустой список без числа осмотренных корней
// неотличим от «обход не состоялся».
console.log(
  `осмотрено деревьев: ${ROOTS.length} (${ROOTS.map(r => path.relative(REPO, r)).join(', ')})`
)

if (soft.length) {
  console.log(
    `\n⚠️  мёртвый хост последним fallback (${soft.length}) — в проде не берётся, но подлежит вычистке:`
  )
  soft.forEach(h => console.log('   ' + h))
}

if (hits.length) {
  console.error(
    `\n❌ МЁРТВЫЙ ХОСТ ЗАШИТ БЕЗ АЛЬТЕРНАТИВЫ (${hits.length}) — исполняется всегда:\n`
  )
  hits.forEach(h => console.error('   ' + h))
  console.error(
    '\nБерите адрес из конфигурации: PUBLIC_URL / PLAYER_URL / BASE_WEBHOOK_URL.'
  )
  console.error(
    'Если упоминание намеренное — поставьте // dead-domain-ok: причина на строке выше.'
  )
  /*
   * exitCode, not exit(): process.exit drops writes still queued on a pipe, and
   * every gate's output goes through one. Measured on the Cyrillic gate the same
   * day: three runs of one script on one commit printed 966, 7706 and 8484 of
   * the same 8484 lines. See scripts/no-cyrillic-guard.cjs for the long note.
   */
  process.exitCode = 1
  return
}

console.log(
  `\n✅ мёртвые хосты (${DEAD.join(', ')}) нигде не зашиты без альтернативы`
)
