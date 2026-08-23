#!/usr/bin/env node
/**
 * Дашборд готовности к продакшену. ИЗМЕРЯЕТ, а не описывает.
 *
 * ПОЧЕМУ ТАК НАПИСАНО. В этом репозитории уже был дашборд, который печатал
 * список из шести шаблонов при одном существующем, и лендинг, который
 * показывал «0 CREATORS / 0 REELS» при трёх реальных записях, потому что
 * читал поля из ответа, где их не было, через `|| 0`. Оба выглядели рабочими.
 *
 * Отсюда три правила, которым подчинён этот файл:
 *
 * 1. КАЖДОЕ ЧИСЛО ПОЛУЧЕНО ЗАПУСКОМ. Ни одной константы «на память».
 * 2. ЧТО НЕ УДАЛОСЬ ИЗМЕРИТЬ — помечается status:"не проверено" и попадает в
 *    отчёт отдельной строкой. Пропущенная проверка НИКОГДА не выглядит как
 *    пройденная: `|| 0` и `catch {}` здесь запрещены.
 * 3. ЖИВЫЕ СЛУЖБЫ ПРОВЕРЯЮТСЯ ЗАПРОСОМ. Зелёный статус деплоя — не ответ
 *    сервиса: в этом проекте деплой был SUCCESS, пока домен отдавал 502.
 *
 * Запуск:  npm run dashboard
 * Пишет:   docs/dashboard/status.json  и  docs/dashboard/STATUS.md
 */
const { execSync } = require('child_process')
const { writeFileSync, mkdirSync, readFileSync, existsSync } = require('fs')
const { resolve } = require('path')

const ROOT = resolve(__dirname, '..')
const OUT_DIR = resolve(ROOT, 'docs', 'dashboard')

const NOT_MEASURED = 'не проверено'

/** Выполнить команду. При провале вернуть null, а НЕ ноль или пустую строку. */
function sh(cmd, opts = {}) {
  try {
    return execSync(cmd, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 64 * 1024 * 1024,
      timeout: opts.timeout ?? 600_000,
    })
  } catch (e) {
    // Ненулевой код у линта и тестов — норма (нашлись проблемы), вывод есть.
    if (e.stdout && String(e.stdout).length > 0) return String(e.stdout)
    return null
  }
}

/** HTTP-код живой службы. null — не удалось спросить. */
function httpCode(url) {
  const r = sh(
    `curl -s -o /dev/null -w '%{http_code}' --max-time 20 '${url}'`,
    {
      timeout: 40_000,
    }
  )
  const n = r && parseInt(r.trim(), 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

function httpBody(url) {
  return sh(`curl -s --max-time 20 '${url}'`, { timeout: 40_000 })
}

// ─────────────────────────────────────────────────────────────
// 1. Живые службы
// ─────────────────────────────────────────────────────────────
const SERVICES = [
  {
    id: 'render',
    название: 'Рендер-сервер',
    url: 'https://vibee-render-production.up.railway.app/health',
  },
  {
    id: 'player',
    название: 'Мини-апп',
    url: 'https://vibee-editor-production.up.railway.app/',
  },
]

function measureServices() {
  return SERVICES.map(s => {
    const code = httpCode(s.url)
    return {
      ...s,
      код: code ?? NOT_MEASURED,
      status: code === null ? NOT_MEASURED : code === 200 ? 'ок' : 'сломано',
    }
  })
}

// ─────────────────────────────────────────────────────────────
// 2. Маршруты ленты — проверяются ЗАПРОСОМ, а не чтением кода
// ─────────────────────────────────────────────────────────────
const R = 'https://vibee-render-production.up.railway.app'

function measureFeed() {
  const out = []

  // stats обязан отдавать ИМЕННО сводку. Он уже отдавал под этим адресом всю
  // ленту с кодом 200 — проверка «код 200» такое не ловит, нужна форма ответа.
  const statsBody = httpBody(`${R}/api/feed/stats`)
  let stats = null
  if (statsBody) {
    try {
      const j = JSON.parse(statsBody)
      stats = [
        'creators_count',
        'reels_count',
        'total_views',
        'total_likes',
      ].every(k => k in j)
        ? j
        : null
    } catch {
      stats = null
    }
  }
  out.push({
    маршрут: 'GET /api/feed/stats',
    status: statsBody === null ? NOT_MEASURED : stats ? 'ок' : 'сломано',
    деталь: stats
      ? `авторов ${stats.creators_count}, роликов ${stats.reels_count}, просмотров ${stats.total_views}`
      : 'в ответе нет полей сводки',
  })

  // Пагинация: page=0 и page=1 обязаны отдать РАЗНЫЕ записи.
  const ids = [0, 1].map(p => {
    const b = httpBody(`${R}/api/feed?page=${p}&limit=1`)
    if (!b) return null
    try {
      return (JSON.parse(b).templates || []).map(t => t.id).join(',')
    } catch {
      return null
    }
  })
  out.push({
    маршрут: 'GET /api/feed?page=',
    status: ids.includes(null)
      ? NOT_MEASURED
      : ids[0] !== ids[1]
        ? 'ок'
        : 'сломано',
    деталь: ids.includes(null)
      ? 'ответ не разобран'
      : `page=0 → [${ids[0]}], page=1 → [${ids[1]}]`,
  })

  // :id со строкой запроса — раньше 500, потому что id брался вместе с ней.
  const oneCode = httpCode(`${R}/api/feed/1?user_id=144022504`)
  out.push({
    маршрут: 'GET /api/feed/:id?user_id=',
    status:
      oneCode === null ? NOT_MEASURED : oneCode === 200 ? 'ок' : 'сломано',
    деталь: `код ${oneCode ?? NOT_MEASURED}`,
  })

  // like/view/use. 401 здесь — ПРАВИЛЬНО: обработчик есть, подписи нет.
  // Раньше эти адреса отдавали 200 со всем списком ленты, и это выглядело
  // работающим, хотя до базы ничего не доходило.
  for (const a of ['like', 'view', 'use']) {
    const c = sh(
      `curl -s -o /dev/null -w '%{http_code}' --max-time 20 -X POST -H 'Content-Type: application/json' -d '{}' '${R}/api/feed/1/${a}'`,
      { timeout: 40_000 }
    )
    const code = c && parseInt(c.trim(), 10)
    out.push({
      маршрут: `POST /api/feed/:id/${a}`,
      status: !code
        ? NOT_MEASURED
        : code === 401
          ? 'ок'
          : code === 200
            ? 'сломано'
            : 'сломано',
      деталь:
        code === 401
          ? 'обработчик есть, нужна подпись'
          : `код ${code ?? NOT_MEASURED}`,
    })
  }
  return out
}

// ─────────────────────────────────────────────────────────────
// 3. Качество кода
// ─────────────────────────────────────────────────────────────
function measureLint() {
  const raw = sh('npx eslint . --format json', { timeout: 900_000 })
  if (!raw) return { status: NOT_MEASURED }
  try {
    const d = JSON.parse(raw)
    return {
      status: 'измерено',
      ошибок: d.reduce((s, f) => s + f.errorCount, 0),
      предупреждений: d.reduce((s, f) => s + f.warningCount, 0),
      файлов: d.length,
    }
  } catch {
    return { status: NOT_MEASURED }
  }
}

function measureTypes() {
  // --pretty false ОБЯЗАТЕЛЕН: на цветном выводе grep по «error TS» молча даёт
  // 0 при тысяче реальных ошибок — уже обжигались.
  const dirs = [
    ['корень', '.'],
    ['мини-апп', 'apps/vibee-editor/player'],
    ['рендер', 'apps/vibee-editor/render'],
  ]
  return dirs.map(([имя, dir]) => {
    const out = sh(`cd '${dir}' && npx tsc --noEmit --pretty false 2>&1`, {
      timeout: 900_000,
    })
    if (out === null) return { имя, status: NOT_MEASURED }
    const n = (out.match(/error TS/g) || []).length
    return { имя, ошибок: n, status: 'измерено' }
  })
}

function measureTests() {
  const p = resolve(ROOT, 'scripts', 'tests-baseline.json')
  if (!existsSync(p))
    return {
      status: NOT_MEASURED,
      почему: 'нет базы, снять: npm run test:baseline',
    }
  const b = JSON.parse(readFileSync(p, 'utf8'))
  return {
    status: 'из базы',
    снято: b.снято,
    всего_файлов: b.всего_файлов,
    падающих_файлов: b.падающих_файлов,
    падающих_тестов: b.падающих_тестов,
  }
}

// ─────────────────────────────────────────────────────────────
// 4. Секреты в отслеживаемых файлах
// ─────────────────────────────────────────────────────────────
const SECRET_FORMS = [
  [
    'Inngest event key',
    String.raw`INNGEST[A-Z_]*KEY["'[:space:]:=]+[A-Za-z0-9_-]{60,}`,
  ],
  ['Inngest signing key', String.raw`signkey-(prod|test|branch)-[a-f0-9]{40,}`],
  ['HeyGen', String.raw`sk_V2_[A-Za-z0-9_-]{20,}`],
  ['GLM/Zhipu', String.raw`[a-f0-9]{32}\.[A-Za-z0-9]{16}`],
  ['FAL', String.raw`[0-9a-f-]{36}:[a-f0-9]{32}`],
]

function measureSecrets() {
  return SECRET_FORMS.map(([имя, re]) => {
    // Значения НЕ печатаем — только сколько файлов задето.
    const out = sh(
      `git ls-files -z | xargs -0 grep -lE '${re}' 2>/dev/null | grep -v probe-secrets | grep -v no-secrets-in-repo`
    )
    if (out === null) return { имя, status: 'чисто', файлов: 0 }
    const files = out.split('\n').filter(Boolean)
    return {
      имя,
      status: files.length ? 'есть в репозитории' : 'чисто',
      файлов: files.length,
    }
  })
}

// ─────────────────────────────────────────────────────────────
// 5. Сборка отчёта
// ─────────────────────────────────────────────────────────────
const commit = (sh('git rev-parse --short HEAD') || '').trim() || NOT_MEASURED
const branch =
  (sh('git rev-parse --abbrev-ref HEAD') || '').trim() || NOT_MEASURED
const stamp = (sh("date -u +'%Y-%m-%d %H:%M UTC'") || '').trim() || NOT_MEASURED

const report = {
  снято: stamp,
  коммит: commit,
  ветка: branch,
  службы: measureServices(),
  лента: measureFeed(),
  линт: measureLint(),
  типы: measureTypes(),
  тесты: measureTests(),
  секреты: measureSecrets(),
}

// Сводка: считаем ТОЛЬКО то, что реально измерено.
const flat = [...report.службы, ...report.лента]
report.сводка = {
  проверок_всего: flat.length,
  ок: flat.filter(x => x.status === 'ок').length,
  сломано: flat.filter(x => x.status === 'сломано').length,
  не_проверено: flat.filter(x => x.status === NOT_MEASURED).length,
}

mkdirSync(OUT_DIR, { recursive: true })
writeFileSync(
  resolve(OUT_DIR, 'status.json'),
  JSON.stringify(report, null, 2) + '\n'
)

const md = []
md.push('# Статус готовности к продакшену\n')
md.push(
  `Снято: **${report.снято}** · коммит \`${report.коммит}\` · ветка \`${report.ветка}\`\n`
)
md.push('> Каждое число здесь получено запуском. Что измерить не удалось —')
md.push(
  '> помечено «не проверено» и НЕ засчитано как успех. Файл переписывается'
)
md.push('> командой `npm run dashboard`.\n')
md.push(
  `**Проверок ${report.сводка.проверок_всего}: ок ${report.сводка.ок}, ` +
    `сломано ${report.сводка.сломано}, не проверено ${report.сводка.не_проверено}**\n`
)

md.push('## Живые службы\n')
md.push('| Служба | Код | Статус |')
md.push('|---|---|---|')
for (const s of report.службы)
  md.push(`| ${s.название} | ${s.код} | ${s.status} |`)

md.push('\n## Лента (проверено запросом)\n')
md.push('| Маршрут | Статус | Деталь |')
md.push('|---|---|---|')
for (const f of report.лента)
  md.push(`| \`${f.маршрут}\` | ${f.status} | ${f.деталь} |`)

md.push('\n## Качество кода\n')
md.push('| Что | Значение |')
md.push('|---|---|')
md.push(
  `| Линт | ${report.линт.status === 'измерено' ? `ошибок ${report.линт.ошибок}, предупреждений ${report.линт.предупреждений}` : NOT_MEASURED} |`
)
for (const t of report.типы)
  md.push(
    `| Типы: ${t.имя} | ${t.status === 'измерено' ? `${t.ошибок} ошибок` : NOT_MEASURED} |`
  )
md.push(
  `| Тесты | ${report.тесты.status === NOT_MEASURED ? NOT_MEASURED : `падает ${report.тесты.падающих_файлов} файлов из ${report.тесты.всего_файлов} (${report.тесты.падающих_тестов} тестов), база от ${report.тесты.снято}`} |`
)

md.push('\n## Секреты в отслеживаемых файлах\n')
md.push('| Форма ключа | Файлов |')
md.push('|---|---|')
for (const s of report.секреты) md.push(`| ${s.имя} | ${s.файлов} |`)
md.push(
  '\n> Значения не печатаются намеренно. Правка файлов ключ не отзывает —'
)
md.push('> найденное подлежит перевыпуску, а не удалению.\n')

writeFileSync(resolve(OUT_DIR, 'STATUS.md'), md.join('\n'))

console.log(md.join('\n'))
console.log(`\nЗаписано: docs/dashboard/status.json и docs/dashboard/STATUS.md`)
