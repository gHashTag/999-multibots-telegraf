/**
 * Швы между «где маршрут объявлен» и «какой адрес мы называем снаружи».
 *
 * Этот тест существует потому, что такие расхождения не ловит НИЧЕГО: ни типы,
 * ни сборка, ни деплой. Строка совпадает по форме, запрос уходит, ответ не
 * приходит — и данные копятся в подвешенном состоянии годами.
 *
 * Что уже стоило денег:
 *   - `${API_URL}/webhooks/replicate` при монтировании на `/api/webhooks`
 *     -> 17 обучений висят от 250 до 465 дней, 3410 звёзд за модели, которых
 *        люди не получили (PR #507)
 *   - `/api/competitor-subscriptions` при монтировании на `/api`
 *     -> настоящий адрес `/api/api/...`, подписки не работали никогда
 *   - x402Router импортирован, бот к нему привязан, но app.use нет
 *     -> все маршруты оплаты 404
 *
 * Тест разбирает ИСХОДНИКИ, а не поднимает сервер: нужен статический факт
 * «объявлено там, зовём отсюда», и он должен проверяться без сети и без БД.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const ROOT = 'src/api_server'
const INDEX = path.join(ROOT, 'index.ts')

const indexSrc = fs.readFileSync(INDEX, 'utf8')

/** import fooRouter from './routes/bar' — в том числе с именованными в фигурных. */
function parseImports(src: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const m of src.matchAll(
    /import\s+(\w+)\s*(?:,\s*\{[^}]*\})?\s*from\s+['"](\.[^'"]+)['"]/g
  )) {
    out.set(m[1], m[2])
  }
  return out
}

/**
 * app.use('/mount', fooRouter) — а также с промежуточными обработчиками:
 * app.use('/mount', requireInternalKey, fooRouter).
 *
 * Роутер — ПОСЛЕДНИЙ аргумент. Первая версия брала второй, и когда перед
 * роутером появился охранник, тест решил, что diagnosticRouter и billingRouter
 * никуда не примонтированы. Поймала проверка npm run test:gate.
 */
function parseMounts(src: string): Array<{ mount: string; varName: string }> {
  const out: Array<{ mount: string; varName: string }> = []
  for (const m of src.matchAll(/app\.use\(\s*['"]([^'"]+)['"]\s*,([^)]+)\)/g)) {
    const args = m[2]
      .split(',')
      .map(x => x.trim())
      .filter(Boolean)
    if (!args.length) continue
    out.push({ mount: m[1], varName: args[args.length - 1] })
  }
  return out
}

function routeFileFor(rel: string): string {
  return path.normalize(path.join(ROOT, rel.replace(/^\.\//, ''))) + '.ts'
}

function declaredRoutes(
  file: string
): Array<{ method: string; declPath: string }> {
  const src = fs.readFileSync(file, 'utf8')
  return [
    ...src.matchAll(
      /router\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/g
    ),
  ].map(m => ({ method: m[1].toUpperCase(), declPath: m[2] }))
}

const imports = parseImports(indexSrc)
const mounts = parseMounts(indexSrc)

/**
 * Файлы роутеров, которые разбор не смог открыть.
 *
 * Раньше здесь стоял молчаливый `continue`. Если бы `routeFileFor` перестал
 * разрешать пути, ВСЕ роутеры отбрасывались бы, и весь этот разбор проходил бы
 * зелёным, ничего не осмотрев. Такая слепота уже случилась в осмотре секретов:
 * он не видел 50 файлов и молчал (docs/audit/tool-blindness.md).
 */
const skipped: string[] = []

describe('швы маршрутов api_server', () => {
  it('разбор открыл все файлы роутеров — иначе проверки ниже пусты', () => {
    // Проверка должна идти ПЕРВОЙ: она объясняет, чего стоят остальные.
    expect(imports.size).toBeGreaterThan(3)
    expect(mounts.length).toBeGreaterThan(3)
  })

  it('ни один маршрут не объявлен с префиксом, который уже даёт монтирование', () => {
    const doubled: string[] = []

    for (const { mount, varName } of mounts) {
      const rel = imports.get(varName)
      if (!rel) continue
      const file = routeFileFor(rel)
      if (!fs.existsSync(file)) {
        skipped.push(`${varName} → ${file}`)
        continue
      }
      if (mount === '/') continue

      for (const { method, declPath } of declaredRoutes(file)) {
        // '/api' + '/api/foo' -> '/api/api/foo'. Именно так подписки на
        // конкурентов уехали на несуществующий адрес.
        if (declPath === mount || declPath.startsWith(mount + '/')) {
          doubled.push(
            `${path.basename(file)}: ${method} ${declPath} при монтировании ${mount} -> ${mount}${declPath}`
          )
        }
      }
    }

    expect(doubled).toEqual([])
  })

  /**
   * Роутеры, которые импортированы, но НАМЕРЕННО не примонтированы.
   *
   * Список обязателен: без него «забыли app.use» и «сознательно не включаем»
   * выглядят одинаково — тишиной. Каждая запись требует причины, и когда
   * причина исчезает, запись надо убрать вместе с ней.
   */
  const DELIBERATELY_UNMOUNTED: Record<string, string> = {
    x402Router:
      'Маршрут /x402-topup зачисляет звёзды по данным из СТРОКИ ЗАПРОСА, ' +
      'а единственной защитой было наличие заголовка X-PAYMENT — его содержимое ' +
      'не проверяется ничем. Проверки платежа (сверки с facilitator) в проекте ' +
      'нет: validatePaymentHeader в core/x402 не вызывается ни разу и всё равно ' +
      'смотрит лишь на наличие полей, не на подпись. Само зачисление теперь ' +
      'закрыто отказом 501, но монтировать роутер до появления настоящей ' +
      'сверки всё равно нельзя.',
  }

  it('каждый импортированный в index.ts роутер либо примонтирован, либо назван в списке исключений', () => {
    const mountedVars = new Set(mounts.map(m => m.varName))
    const unexplained: string[] = []

    for (const [varName, rel] of imports) {
      if (!/Router$/i.test(varName)) continue
      const file = routeFileFor(rel)
      if (!fs.existsSync(file)) {
        skipped.push(`${varName} → ${file}`)
        continue
      }
      if (!declaredRoutes(file).length) continue
      if (mountedVars.has(varName)) continue
      if (DELIBERATELY_UNMOUNTED[varName]) continue
      unexplained.push(
        `${varName} (${path.basename(file)}, маршрутов: ${declaredRoutes(file).length})`
      )
    }

    // Сюда попадал x402Router: импортирован, бот к нему привязан через
    // setX402BotInstance, а app.use забыли — все маршруты оплаты отдавали 404.
    expect(unexplained).toEqual([])
  })

  it('в списке исключений нет тех, кого уже примонтировали', () => {
    const mountedVars = new Set(mounts.map(m => m.varName))
    const stale = Object.keys(DELIBERATELY_UNMOUNTED).filter(v =>
      mountedVars.has(v)
    )
    // Иначе исключение переживёт свою причину и будет молча прикрывать
    // следующую ошибку.
    expect(stale).toEqual([])
  })

  it('адреса обратного вызова, которые мы сообщаем наружу, ведут на существующий маршрут', () => {
    // Собираем таблицу настоящих путей.
    const real = new Set<string>()
    for (const { mount, varName } of mounts) {
      const rel = imports.get(varName)
      if (!rel) {
        // Монтирование не роутер-файла (например serve() из inngest на
        // '/api/inngest'). Такой обработчик отвечает на всё под своим
        // префиксом — записываем его как префикс.
        if (mount !== '/') real.add(mount.replace(/\/$/, '') + '/**')
        continue
      }
      const file = routeFileFor(rel)
      if (!fs.existsSync(file)) {
        skipped.push(`${varName} → ${file}`)
        continue
      }
      for (const { declPath } of declaredRoutes(file)) {
        const full = (mount === '/' ? '' : mount) + declPath
        real.add(full.replace(/\/$/, '') || '/')
      }
    }

    /**
     * Адреса, которые НАМЕРЕННО ведут не на этот сервер. Каждый с причиной —
     * список нужен, чтобы тест не превратился в «замолчать всё подряд».
     *
     * Это НЕ значит, что с ними всё хорошо. Отдельно измерено и вынесено в
     * docs/audit/route-seams.md: переменная API_SERVER_URL в проде НЕ ЗАДАНА,
     * поэтому вся эта семья запросов уходит на строку "undefined/..." и всегда
     * падает в План Б. Здесь они исключены лишь потому, что «добавить /api»
     * их НЕ ЧИНИТ — у generateVoiceAvatar это вообще дало бы рекурсию:
     * voice-avatar.routes.ts вызывает generateVoiceAvatar, а тот стучится по
     * HTTP обратно.
     */
    const EXTERNAL_AI_SERVER = [
      '/generate/neuro-photo',
      '/generate/neuro-photo-v2',
      '/generate/neuro-photo-multi',
      '/generate/text-to-speech',
      '/generate/voice-avatar',
      '/generate', // FoundationUsageExamples — пример, не рабочий код
    ]

    // Ищем в коде шаблоны вида `${ЧТО_ТО}/путь`, похожие на наш собственный
    // сервер. Внешние адреса (Supabase Functions и прочее) сюда не попадают:
    // у них в шаблоне есть /functions/.
    const files: string[] = []
    ;(function walk(dir: string) {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name === 'node_modules' || e.name === '__tests__') continue
        const p = path.join(dir, e.name)
        if (e.isDirectory()) walk(p)
        else if (p.endsWith('.ts')) files.push(p)
      }
    })('src')

    // Комментарии вырезаем: в них намеренно цитируются СТАРЫЕ неверные адреса,
    // чтобы объяснить, почему их поменяли. Без этого тест ловил бы собственное
    // объяснение как дефект.
    const stripComments = (s: string) =>
      s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

    const bad: string[] = []
    for (const f of files) {
      const src = stripComments(fs.readFileSync(f, 'utf8'))
      for (const m of src.matchAll(
        /`\$\{[^}]+\}(\/(?:api\/)?(?:webhooks|telegram|generate|inngest|billing)[^`$]*)`/g
      )) {
        const p = m[1].replace(/\/$/, '')
        if (p.includes('/functions/')) continue
        if (EXTERNAL_AI_SERVER.includes(p)) continue
        // Пути с параметрами и префиксные монтирования сверяем по шаблону.
        const hit = [...real].some(r => {
          const rx = new RegExp(
            '^' +
              r.replace(/\/\*\*$/, '(/.*)?').replace(/:[^/]+/g, '[^/]+') +
              '$'
          )
          return rx.test(p)
        })
        if (!hit) {
          const line = src.slice(0, m.index).split('\n').length
          bad.push(`${f}:${line}  ${p}`)
        }
      }
    }

    // Здесь ловится `${API_URL}/webhooks/replicate` — ровно тот случай, из-за
    // которого 17 обучений остались без ответа.
    expect(bad).toEqual([])
  })

  it('ни один файл роутера не был пропущен из-за неразрешённого пути', () => {
    // Счётчик наполняется проверками выше. Пустой список означает, что каждый
    // импортированный роутер действительно осмотрен.
    expect(skipped).toEqual([])
  })
})
