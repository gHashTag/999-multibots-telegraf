/**
 * Внутренние маршруты закрыты служебным ключом.
 *
 * Повод — живая проверка прода. Эти адреса отдавали данные БЕЗ авторизации:
 *
 *   GET /api/billing                      финансы по всем ботам
 *   GET /api/billing/:botName             то же по одному
 *   GET /api/models/:telegramId           чужие обученные модели по номеру
 *   GET /api/diagnostic/trainings/:id     чужие обучения по номеру
 *   GET /api/diagnostic/trainings-recent  последние обучения по всем
 *   GET /api/diagnostic/training-config   настройки и начала ключей
 *
 * Номер в Telegram не секрет и перебирается, поэтому «знать адрес» защитой не
 * было.
 *
 * Тест разбирает монтирование в исходниках, а не поднимает сервер: нужен
 * статический факт «этот роутер закрыт», и он должен проверяться без сети.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'

const INDEX = 'src/api_server/index.ts'

const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

/**
 * Роутеры, которые обязаны быть за служебным ключом. Значение — почему.
 */
const MUST_BE_PROTECTED: Record<string, string> = {
  diagnosticRouter: 'отдаёт чужие модели и обучения по номеру, плюс настройки',
  billingRouter: 'отдаёт финансы по всем ботам',
  voiceAvatarRouter:
    'запускает генерацию по telegram_id ИЗ ТЕЛА запроса — посторонний мог ' +
    'тратить чужой баланс и наш бюджет у поставщика',
  neuroPhotoRouter:
    'то же: считает стоимость, проводит оплату и зовёт replicate.run()',
}

/**
 * Роутеры, которые обязаны остаться ОТКРЫТЫМИ, с причиной. Закрыть их
 * служебным ключом значило бы сломать работу.
 */
const MUST_STAY_OPEN: Record<string, string> = {
  healthRouter: 'проверка живости — её дёргает инфраструктура без ключей',
  robokassaRouter: 'подтверждение оплаты приходит от платёжной системы',
  kieAiWebhookRouter: 'обратные вызовы поставщика генерации',
  aiReelsCallbackRouter: 'обратные вызовы рендера',
  replicateWebhookRouter: 'обратные вызовы Replicate',
  githubAutoFixerRouter: 'обратные вызовы GitHub, подпись проверяется внутри',
  competitorRouter: 'отвечает 501, данных не отдаёт',
}

function mounts(): Array<{ mount: string; guarded: boolean; varName: string }> {
  const src = strip(fs.readFileSync(INDEX, 'utf8'))
  const out: Array<{ mount: string; guarded: boolean; varName: string }> = []
  for (const m of src.matchAll(/app\.use\(\s*['"]([^'"]+)['"]\s*,\s*([^)]+)\)/g)) {
    const args = m[2].split(',').map(x => x.trim())
    const guarded = args.some(a => a === 'requireInternalKey')
    const varName = args[args.length - 1]
    out.push({ mount: m[1], guarded, varName })
  }
  return out
}

describe('внутренние маршруты закрыты', () => {
  const list = mounts()

  it('разбор находит монтирования — иначе тест пустой', () => {
    expect(list.length).toBeGreaterThan(5)
  })

  it('роутеры с внутренними данными закрыты служебным ключом', () => {
    const open: string[] = []
    for (const [name, why] of Object.entries(MUST_BE_PROTECTED)) {
      const found = list.filter(m => m.varName === name)
      if (!found.length) {
        open.push(`${name}: не примонтирован вовсе (${why})`)
        continue
      }
      for (const f of found) {
        if (!f.guarded) open.push(`${name} на ${f.mount}: БЕЗ ключа — ${why}`)
      }
    }
    expect(open).toEqual([])
  })

  it('каждый открытый роутер назван с причиной', () => {
    const unexplained = list
      .filter(m => !m.guarded)
      .filter(m => /Router$/.test(m.varName))
      .filter(m => !MUST_STAY_OPEN[m.varName] && !MUST_BE_PROTECTED[m.varName])
      .map(m => `${m.varName} на ${m.mount}`)

    // Новый открытый роутер должен быть осознанным решением, а не забывчивостью.
    expect(unexplained).toEqual([])
  })

  it('в списке открытых нет тех, кого уже закрыли', () => {
    const stale = Object.keys(MUST_STAY_OPEN).filter(name =>
      list.some(m => m.varName === name && m.guarded)
    )
    expect(stale).toEqual([])
  })
})
