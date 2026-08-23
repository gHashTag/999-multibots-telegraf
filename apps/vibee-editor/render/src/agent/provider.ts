/**
 * Выбор модели для агента. Два провайдера с ОДНИМ протоколом.
 *
 * z.ai (GLM) и OpenAI оба говорят на диалекте /chat/completions, поэтому
 * различие сводится к базовому адресу, имени переменной с ключом и одному
 * полю: у GLM режим размышления включается блоком `thinking`, у OpenAI его
 * нет вовсе.
 *
 * ПОЧЕМУ НЕ «просто OpenAI». Владелец просил кодерскую модель z.ai и видимый
 * поток размышления. GLM отдаёт reasoning_content отдельным полем — его можно
 * показывать человеку по мере поступления, а не после того, как всё
 * досчиталось. У OpenAI такого поля в этом API нет, и притворяться, что есть,
 * значит показывать пустую панель «думает».
 *
 * ПОЧЕМУ ОТКАЗ ГРОМКИЙ. Пустой ключ уезжал бы к провайдеру и возвращался
 * невнятной 400 через три вызова. Здесь он падает на первой строке с именем
 * переменной и командой, которой её взять.
 */

export type ProviderId = 'zai' | 'openai'

export interface Provider {
  id: ProviderId
  base: string
  model: string
  key: string
  /** Умеет ли отдавать поток размышления отдельным полем. */
  thinking: boolean
}

const CATALOG: Record<
  ProviderId,
  { base: string; env: string; model: string; thinking: boolean }
> = {
  // z.ai — международный вход Zhipu. Тот же ключ работает и на
  // open.bigmodel.cn; адрес вынесен в переменную на случай смены.
  zai: {
    base: process.env.ZAI_BASE_URL || 'https://api.z.ai/api/paas/v4',
    env: 'GLM_API_KEY',
    model: 'glm-4.6',
    thinking: true,
  },
  openai: {
    base: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    env: 'OPENAI_API_KEY',
    model: 'gpt-4o-mini',
    thinking: false,
  },
}

export function resolveProvider(): Provider {
  const wanted = (process.env.AGENT_PROVIDER || '').toLowerCase() as ProviderId
  const order: ProviderId[] =
    wanted === 'zai' || wanted === 'openai'
      ? [wanted, wanted === 'zai' ? 'openai' : 'zai']
      : ['zai', 'openai']

  for (const id of order) {
    const c = CATALOG[id]
    const key = process.env[c.env]
    if (key) {
      return {
        id,
        base: c.base,
        // AGENT_MODEL перекрывает умолчание, но только если провайдер тот,
        // для которого имя модели имеет смысл: glm-4.6 у OpenAI не существует,
        // и подставить его туда — верный способ получить 404 вместо ответа.
        model: (id === order[0] && process.env.AGENT_MODEL) || c.model,
        key,
        thinking: c.thinking,
      }
    }
  }

  const names = order.map(id => CATALOG[id].env).join(' или ')
  throw new Error(
    `Ключ модели не задан. Нужен ${names}. ` +
      'Взять: railway variables --kv | grep -E "GLM_API_KEY|OPENAI_API_KEY"'
  )
}
