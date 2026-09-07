/**
 * WHAT THE BOT CAN ACTUALLY DELIVER RIGHT NOW -- AND WHAT IT CANNOT.
 *
 * Owner: "clients want to pay and we cannot give them the service".
 *
 * That is how it was built. The startup check demanded three variables --
 * NODE_ENV, WEBHOOK_DOMAIN, BOT_TOKEN_1 -- and not one key that any paid
 * service depends on. The bot came up "successfully", offered photos, video
 * and voice, walked a person all the way to payment, and discovered the
 * missing key at generation time: after the charge, deep inside a handler.
 *
 * Here it is asked ONCE and in advance. A key is either set or it is not, and
 * that is settled without a single provider call, without money and without
 * delay.
 *
 * WHAT THIS CHECK DOES NOT KNOW, and the difference matters:
 *
 *   - a key that IS set can still be invalid. The code next door records what
 *     the owner verified on 06.09.2026: zai was rate-limited and the OpenAI
 *     key was invalid -- both of those happen with the key present;
 *   - a provider can run out of balance;
 *   - a user's model may not be trained.
 *
 * So the verdict is deliberately narrow: not "the service works", but "there
 * is no key, so it cannot work at all". The first needs a provider call; the
 * second is visible immediately, and it was the one being skipped in silence.
 */
import { logger } from '@/utils/logger'

export interface Capability {
  /** What it is called for the person we are offering it to. */
  name: string
  /** Where it lives -- pinned by a test so the map cannot drift from code. */
  file: string
  /**
   * Where the variable is REALLY read, when not in the service file itself.
   *
   * The neuro-photo flow takes its client from `@/core/replicate` and never
   * mentions the token once: the core reads it. The first version of this map
   * pointed at the service file and the test caught it -- "is the variable
   * named in this file" would otherwise be wrong for every service that goes
   * through a shared client.
   */
  keysIn?: string
  /** ALL of these are required. */
  needs?: string[]
  /** ANY ONE of these is enough (providers are tried down the list). */
  anyOf?: string[]
  /** Whether we take money for it. Paid and keyless is a sale that cannot happen. */
  paid: boolean
}

/**
 * The service map.
 *
 * Every row is checked against its own file: the file exists, and each key
 * named here is genuinely read by it. A map that drifted from the code would
 * report capabilities that do not exist -- precisely the failure it is written
 * against.
 *
 * TWO DORMANT CHARGING FILES ARE DELIBERATELY ABSENT.
 *
 * `src/__tests__/money/chargeSiteCensus.test.ts` holds them by name: both
 * charge money and NOTHING calls them. That ratchet goes red the moment a
 * reference appears, so the double-charge question is asked when one is wired
 * up rather than afterwards. The first version of this map listed them by
 * path, the ratchet noticed, and the conclusion was the opposite of the
 * expected one: a service nobody calls is not a service. Advertising it would
 * tell the owner "you only need the key" when the key switches nothing on.
 *
 * Their names are not written here even in prose: that ratchet looks for a
 * bare identifier in the file text, and to it a mention is indistinguishable
 * from a call. The explanation of why a file is absent became a "reference"
 * to it.
 */
export const CAPABILITIES: Capability[] = [
  {
    name: 'Агент в чате (47 инструментов, общая память с приложением)',
    file: 'src/services/trinityAgent.ts',
    needs: ['RENDER_API_KEY'],
    paid: false,
  },
  {
    name: 'Ответ моделью без инструментов (запасной путь чата)',
    file: 'src/services/aiChatService.ts',
    anyOf: ['DEEPSEEK_API_KEY', 'OPENAI_API_KEY', 'OPENROUTER_API_KEY'],
    paid: false,
  },
  {
    name: 'Нейрофото по обученной модели',
    file: 'src/inngest_app/functions/generation/neuroImageGeneration.ts',
    keysIn: 'src/core/replicate/index.ts',
    needs: ['REPLICATE_API_TOKEN'],
    paid: true,
  },
  {
    name: 'Нейрофото напрямую',
    file: 'src/services/generateNeuroPhotoDirect.ts',
    needs: ['FAL_KEY'],
    paid: true,
  },
  {
    name: 'Nano Banana',
    file: 'src/services/generateNanoBanana.ts',
    needs: ['REPLICATE_API_TOKEN'],
    paid: true,
  },
  {
    name: 'Nano Banana Pro',
    file: 'src/services/generateNanoBananaPro.ts',
    needs: ['FAL_KEY'],
    paid: true,
  },
  {
    name: 'Разбор Instagram',
    file: 'src/services/generateInstagramScraping.ts',
    needs: ['RAPIDAPI_INSTAGRAM_KEY'],
    paid: true,
  },
  {
    name: 'Видео из текста (Kie.ai)',
    file: 'src/scenes/textToVideoWizard/index.ts',
    keysIn: 'src/services/video-providers/KieAiProvider.ts',
    needs: ['KIE_AI_API_KEY'],
    paid: true,
  },
  {
    name: 'Липсинк Veed Fabric (Kie.ai)',
    file: 'src/core/lipsync/providers/kie-veed-fabric-provider.ts',
    needs: ['KIE_AI_API_KEY'],
    paid: true,
  },
]

export interface Verdict {
  capability: Capability
  available: boolean
  /** Exactly which variables are missing -- that is what has to be set. */
  missing: string[]
}

/*
 * WHAT THIS CANNOT KNOW, said here so the next reader does not trust it too far.
 *
 * A variable being set is not a key that works, and the difference has been the
 * live one every time: fal was set with an exhausted balance, ELEVENLABS holds
 * an API key ID rather than a key, and OPENAI answers 401 Incorrect API key.
 * All three pass this check and refuse at the moment somebody asks.
 *
 * Asking the providers on every boot would put three network calls in front of
 * every restart, so it stays out of here and lives in a command instead:
 * `tri ключи --gate` (scripts/provider-liveness.cjs).
 */
const isSet = (name: string): boolean => Boolean(process.env[name]?.trim())

/** Check one service. Calls nothing outside the process. */
export function check(c: Capability): Verdict {
  const missing: string[] = []
  for (const k of c.needs ?? []) if (!isSet(k)) missing.push(k)
  const any = c.anyOf ?? []
  if (any.length && !any.some(isSet)) {
    missing.push(`любой из: ${any.join(', ')}`)
  }
  return { capability: c, available: missing.length === 0, missing }
}

export function checkAll(): Verdict[] {
  return CAPABILITIES.map(check)
}

/**
 * The line handed to the fallback model: what it must NOT offer.
 *
 * With the agent unreachable the answer comes from a model with no tools, and
 * its prompt tells it to help "make photos, video, voice". It agrees to do
 * what it cannot invoke, and the person waits for a result that will never
 * arrive. The owner called that "talks complete nonsense and makes no assets".
 *
 * The list is computed from the environment rather than written by hand, so
 * the model can neither invent it nor soften it. Empty string when everything
 * is available -- a warning that is always present gets ignored within a day,
 * and would be a lie whenever the services do work.
 */
export function unavailableWarning(): string {
  const dead = checkAll()
    .filter(v => !v.available && v.capability.paid)
    .map(v => v.capability.name)
  if (!dead.length) return ''
  return (
    'ВАЖНО: прямо сейчас НЕ работают и НЕ могут быть выполнены: ' +
    dead.join('; ') +
    '. Не предлагай их и не обещай сделать. Если просят именно это — ' +
    'скажи прямо, что услуга временно недоступна, и не проси оплату. '
  )
}

/**
 * Print the report at startup.
 *
 * Does NOT stop the bot. Some services are switched off on purpose, and dying
 * because of one provider would take the bot away from everyone whose setup is
 * fine. But silence is not an option either: an unavailable PAID service is
 * logged as an error, because it is a sale that cannot happen.
 */
export function reportAtStartup(): Verdict[] {
  const all = checkAll()
  const ok = all.filter(v => v.available)
  const dead = all.filter(v => !v.available)

  logger.info('[preflight] what the bot can deliver', {
    available: ok.length,
    unavailable: dead.length,
    total: all.length,
  })
  for (const v of dead) {
    const where = `${v.capability.name} (${v.capability.file})`
    const what = v.missing.join(', ')
    if (v.capability.paid) {
      logger.error(`[preflight] PAID SERVICE UNAVAILABLE: ${where} — ${what}`)
    } else {
      logger.warn(`[preflight] unavailable: ${where} — ${what}`)
    }
  }
  return all
}
