/**
 * Функция, которая определена, но не зарегистрирована, — это мёртвый код,
 * выглядящий как рабочий.
 *
 * ПОЧЕМУ ЭТОТ ТЕСТ СУЩЕСТВУЕТ. Я трижды подряд починил код в файлах, которых
 * нет в registerFunctions:
 *
 *   PR #507  training/generateModelTraining — недостающий префикс /api в
 *            адресе вебхука Replicate. Замер (17 зависших обучений, 3410
 *            звёзд) верен, живой 404 проверен, но САМ ФАЙЛ не зарегистрирован.
 *            Зарегистрирован другой — existing/generateModelTrainingFunction,
 *            и в нём адрес был правильный изначально.
 *
 *   PR #508  training/voiceTrainingRVC — убрал мёртвый вебхук. Файл тоже не
 *            зарегистрирован.
 *
 *   PR #510  переименовал событие на instagram/scraper-v2. Подписчик
 *            instagramScraper-v2 ЗАКОММЕНТИРОВАН в registerFunctions
 *            (строки 19 и 66).
 *
 * Ни typecheck, ни тесты, ни деплой этого не показывают: файл компилируется,
 * импортируется из functions/index.ts, выглядит живым. Единственный способ
 * увидеть — сравнить список определений со списком регистраций.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const ROOT = 'src/inngest_app'
const REGISTRY = path.join(ROOT, 'registerFunctions.ts')

/**
 * Функции, определённые НАМЕРЕННО без регистрации. Значение — причина.
 *
 * Список обязателен: без него «забыли подключить» и «сознательно выключено»
 * выглядят одинаково — тишиной. Тот же приём, что со списками
 * непримонтированных роутеров и внешних событий.
 */
const DELIBERATELY_UNREGISTERED: Record<string, string> = {
  'functions/__dev__/testSimpleFunction': 'демо-функция для проверки связи',
  'functions/__dev__/testSimpleMessageFunction':
    'демо-функция для проверки связи',
  'functions/__dev__/testAdvancedLoopFunction':
    'демо-функция для проверки связи',
  'functions/neuroImageGeneration':
    'старая копия; зарегистрирована generation/neuroImageGeneration',
  'functions/morphImages':
    'старая копия; зарегистрирована training/morphImages',
  'functions/training/generateModelTraining':
    'старая копия; зарегистрирована existing/generateModelTrainingFunction. ' +
    'Именно сюда по ошибке ушёл фикс PR #507 — см. docs/audit/unregistered-functions.md',
  'functions/instagram/instagramScraper-v2':
    'ЗАКОММЕНТИРОВАНА в registerFunctions (строки 19 и 66). Парсинг Instagram ' +
    'выключен целиком: отправитель отказывает честно (PR #510), получатель не ' +
    'зарегистрирован, RAPIDAPI_INSTAGRAM_KEY в проде не задана',
  'functions/training/voiceTrainingRVC':
    'обучение голоса не подключено; фикс PR #508 ушёл сюда же',
  // functions/webhookHealthGuard: validateWebhookBeforeGeneration is now wired
  // (video/generation-validate-webhook has a live sender in KieAiProvider). The
  // hourly cron periodicWebhookHealthCheck and webhookHealthCheck are left off
  // on purpose, but this test works at FILE granularity, so there is no separate
  // line to track them.
  'functions/kieAiWebhookMonitor': 'монитор вебхуков KieAI не подключён',
  // Withdrawn 2026-09-17 on the owner's decision (the 2026-09-13 plan left
  // them open). Spec of record: specs/functions/<id>.t27 in t27 (CONTROL
  // code-only/unregistered); the manifest control says the same.
  'functions/training/modelTrainingV2':
    'снята 2026-09-17: get-bot кладёт экземпляр Telegraf (с токеном) в вывод ' +
    'шага, запись в БД после платного вызова, у ветки BFL нет обработчика завершения',
  'functions/generation/neuroImageGeneration':
    'снята 2026-09-17: событие neuro/image.generate никто не шлёт ' +
    '(scripts/orphan-events.cjs); списание до генерации, без возврата и без inv_id',
  'functions/render/renderAvatarVideo':
    'снята 2026-09-17: hedra/heygen/kieAI/elevenLabs — заглушки, запуск ' +
    'отчитался бы о видео, которого нет',
  'functions/content/analyzeCompetitorReels':
    'снята 2026-09-17: saveReelsAnalysis — заглушка (src/core/instagram/index.ts), ' +
    'а RapidAPI оплачивается до 12 раз за событие',
  'functions/content/findCompetitors':
    'снята 2026-09-17: saveCompetitors — заглушка (src/core/instagram/index.ts), ' +
    'а RapidAPI оплачивается',
  // functions/existing/handleModelTrainingCompleted — ПОДКЛЮЧЕН (registerFunctions),
  // webhook Replicate → model/training.completed теперь имеет подписчика.
}

function definitionFiles(): string[] {
  const out: string[] = []
  ;(function walk(dir: string) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules') continue
      const p = path.join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (p.endsWith('.ts')) out.push(p)
    }
  })(ROOT)

  return out
    .filter(f => !f.includes('/test/') && !f.includes('__tests__'))
    .filter(f =>
      /inngest\.createFunction\s*\(/.test(strip(fs.readFileSync(f, 'utf8')))
    )
    .map(f => f.replace(`${ROOT}/`, '').replace(/\.ts$/, ''))
}

/**
 * A module counts as registered only if at least one symbol imported FROM it is
 * actually REFERENCED in the file body — the allFunctionsRaw array, or a factory
 * call whose result is in that array — not merely because an import line exists.
 *
 * Being imported is not being served. A symbol can be imported and then left out
 * of the array; eslint's no-unused-vars is only a warning here, so nothing else
 * catches it, and the earlier "an import line matches" check counted such a
 * function as registered. That is the same "looks wired != is wired" gap this
 * whole test guards against, one level up — so the ruler has to look at use, not
 * at the presence of an import.
 */
export function registeredFromSource(source: string): Set<string> {
  const body = strip(source)
  const importRe =
    /import\s*(?:\{([^}]*)\}|(\w+))\s*from\s*['"]\.\/(functions\/[^'"]+)['"]/g
  const bodyWithoutImports = body.replace(importRe, '')
  const registered = new Set<string>()
  for (const m of body.matchAll(importRe)) {
    const mod = m[3]
    const idents = (m[1] ? m[1].split(',') : [m[2]])
      .map(x =>
        x
          .trim()
          .split(/\s+as\s+/)[0]
          .trim()
      )
      .filter(Boolean)
    const used = idents.some(id =>
      new RegExp(`\\b${id}\\b`).test(bodyWithoutImports)
    )
    if (used) registered.add(mod)
  }
  return registered
}

function registeredModules(): Set<string> {
  return registeredFromSource(fs.readFileSync(REGISTRY, 'utf8'))
}

describe('регистрация функций Inngest', () => {
  const defined = definitionFiles()
  const registered = registeredModules()

  it('разбор находит определения и регистрации — иначе тест пустой', () => {
    expect(defined.length).toBeGreaterThan(20)
    expect(registered.size).toBeGreaterThan(15)
  })

  it('каждая определённая функция либо зарегистрирована, либо названа с причиной', () => {
    const unexplained = defined.filter(
      f => !registered.has(f) && !DELIBERATELY_UNREGISTERED[f]
    )
    expect(unexplained).toEqual([])
  })

  it('в списке исключений нет тех, кого уже подключили', () => {
    // Иначе запись переживёт свою причину и молча прикроет следующую ошибку.
    const stale = Object.keys(DELIBERATELY_UNREGISTERED).filter(f =>
      registered.has(f)
    )
    expect(stale).toEqual([])
  })

  it('в списке исключений нет несуществующих файлов', () => {
    const gone = Object.keys(DELIBERATELY_UNREGISTERED).filter(
      f => !defined.includes(f)
    )
    expect(gone).toEqual([])
  })

  // The ruler must key off USE, not the presence of an import line. These two
  // synthetic sources pin that down so the check cannot quietly regress to
  // "an import exists" — the weaker form that would pass a function which was
  // imported but never added to allFunctionsRaw.
  it('импортирована, но не в массиве — считается НЕ зарегистрированной', () => {
    const source = [
      "import { realFn } from './functions/real'",
      "import { forgottenFn } from './functions/forgotten'",
      'const allFunctionsRaw = [realFn]',
    ].join('\n')
    const reg = registeredFromSource(source)
    expect(reg.has('functions/real')).toBe(true)
    expect(reg.has('functions/forgotten')).toBe(false)
  })

  it('фабрикой собранная функция считается зарегистрированной', () => {
    const source = [
      "import { createFooFunction } from './functions/existing/foo'",
      'const foo = createFooFunction(inngest)',
      'const allFunctionsRaw = [foo]',
    ].join('\n')
    expect(registeredFromSource(source).has('functions/existing/foo')).toBe(
      true
    )
  })
})
