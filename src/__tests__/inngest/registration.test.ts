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
  'functions/testSimpleFunction': 'демо-функция для проверки связи',
  'functions/testSimpleMessageFunction': 'демо-функция для проверки связи',
  'functions/testAdvancedLoopFunction': 'демо-функция для проверки связи',
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
  'functions/training/checkStuckTrainings':
    'сторож зависших обучений с расписанием раз в 30 минут — НЕ ПОДКЛЮЧЁН. ' +
    'Именно он чинил бы 17 обучений, висящих по 250-465 дней. Подключение — ' +
    'решение владельца: функция будет менять статусы в базе',
  // functions/webhookHealthGuard: validateWebhookBeforeGeneration is now wired
  // (video/generation-validate-webhook has a live sender in KieAiProvider). The
  // hourly cron periodicWebhookHealthCheck and webhookHealthCheck are left off
  // on purpose, but this test works at FILE granularity, so there is no separate
  // line to track them.
  'functions/kieAiWebhookMonitor': 'монитор вебхуков KieAI не подключён',
  'functions/welcomeAvatarGeneration':
    'НЕ ПОДКЛЮЧЕНА, при том что createUserScene:188 шлёт ей событие ' +
    'user/welcome.avatar.generate — приветственные аватары не генерируются',
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

function registeredModules(): Set<string> {
  const src = strip(fs.readFileSync(REGISTRY, 'utf8'))
  return new Set(
    [...src.matchAll(/from\s+['"]\.\/(functions\/[^'"]+)['"]/g)].map(m => m[1])
  )
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
})
