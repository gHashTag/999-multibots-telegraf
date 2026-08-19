#!/usr/bin/env node
/**
 * Не даёт мёртвому домену вернуться в исполняемый код.
 *
 * three-head-dragon.shop резолвится в 188.137.250.69 — старый сервер, с
 * которого проект переехал на Railway. Он не отвечает ни по https, ни по http,
 * ни по IP. При этом домен стоял как fallback в цепочке платёжного URL
 * (ResultURL Robokassa — серверное подтверждение оплаты) и был зашит в адресах
 * коллбэков, куда провайдеры возвращают готовый результат.
 *
 * Упоминания в комментариях разрешены: без них следующий читатель не поймёт,
 * почему домена нет.
 */
const fs = require('fs')
const path = require('path')

const DEAD = 'three-head-dragon.shop'
const ROOT = path.resolve(__dirname, '..', 'src')
const hits = []   // зашито без альтернативы — исполняется всегда
const soft = []   // последний fallback после env — в проде не берётся

;(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) { if (!/node_modules|__tests__/.test(p)) walk(p) }
    else if (/\.ts$/.test(p)) {
      const arr = fs.readFileSync(p, 'utf8').split('\n')
      arr.forEach((line, i) => {
        if (!line.includes(DEAD)) return
        const code = line.trim()
        // комментарий — не нарушение
        if (code.startsWith('//') || code.startsWith('*') || code.startsWith('/*')) return
        // Явный маркер исключения. Нужен там, где домен упомянут НАМЕРЕННО —
        // например в детекторе, который предупреждает, что webhook указывает
        // на мёртвый хост. Ставится комментарием на предыдущей строке.
        const prev = (arr[i - 1] || '').trim()
        if (prev.includes('dead-domain-ok')) return
        // Отличаем ОПАСНОЕ от инертного.
        //
        // Инертное — домен как последний fallback после переменных окружения:
        //   process.env.BASE_WEBHOOK_URL || 'https://three-head-dragon.shop'
        // В проде переменная задана, ветка не берётся. Неправильно, но сегодня
        // никого не задевает.
        //
        // Опасное — домен без всякой альтернативы. Такое исполняется всегда.
        // Именно так были сломаны коллбэк AI Reels и ссылки статуса lipsync.
        const isFallback = /\|\||\?\s*[`'"]|:\s*[`'"]/.test(code)
        const loc = `${path.relative(path.resolve(__dirname, '..'), p)}:${i + 1}`
        ;(isFallback ? soft : hits).push(`${loc}  ${code.slice(0, 90)}`)
      })
    }
  }
})(ROOT)

if (soft.length) {
  console.log(`⚠️  ${DEAD} как последний fallback (${soft.length}) — в проде не берётся, но подлежит вычистке:`)
  soft.forEach(h => console.log('   ' + h))
  console.log()
}

if (hits.length) {
  console.error(`❌ ${DEAD} ЗАШИТ БЕЗ АЛЬТЕРНАТИВЫ (${hits.length}) — исполняется всегда:\n`)
  hits.forEach(h => console.error('   ' + h))
  console.error('\nБерите адрес из конфигурации: PUBLIC_URL / BASE_WEBHOOK_URL.')
  console.error('Если упоминание намеренное — поставьте // dead-domain-ok: причина на строке выше.')
  process.exit(1)
  // ВОРОТА ВКЛЮЧЕНЫ. Список вычищен до нуля, поэтому падение здесь означает
  // именно возврат мёртвого домена, а не унаследованный долг.
  // Прежний комментарий про «намеренно не падаем»: Разделение «зашито/fallback» здесь грубое: часть
  // строк выше — просто текст предупреждений, часть — многострочные цепочки,
  // где || стоит на предыдущей строке. Делать из этого ворота сборки значило
  // бы ломать сборку на ложных срабатываниях. Это трекер: список сокращается
  // по мере вычистки, и когда он опустеет — можно будет включить падение.
}
console.log(`✅ ${DEAD} нигде не зашит без альтернативы`)
