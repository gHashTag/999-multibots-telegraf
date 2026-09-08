import { priceFor } from './billing-shared'

/**
 * ЕДИНЫЙ ИСТОЧНИК ПРАВДЫ: что бесплатно, что платно, как настроить провайдеров.
 * Отсюда берут и агент (инструменты pricing/provider_setup), и мини-апп. Рукописный список в двух местах неизбежно разошёлся бы —
 * поэтому один модуль.
 *
 * Проверено живыми вызовами 2026-08-28 (аудит готовности к оплате): каждая
 * интеграция код-корректна, платные провайдеры падают ТОЛЬКО на балансе/ключе,
 * оплата их оживит. Replicate уже оплачен и отдаёт реальный вывод.
 */

/** Бесплатно — в производстве ничего не стоит. */
export const FREE = [
  {
    что: 'Лента: смотреть, лайкать, ремиксить из готовых файлов',
    как: 'локально, БД',
  },
  {
    что: 'Агент-чат, сценарии, тексты',
    как: 'GLM флэт-рейт (кодерская подписка)',
  },
  { что: 'SOUL (голос владельца), скиллы, план', как: 'БД' },
  {
    что: 'Блог-рил: текст + барочная гравюра (TrinityBlogReel)',
    как: 'локальный Remotion, без платных генераций',
  },
  { что: 'img2img-сцены из фото', как: 'Pollinations FLUX — keyless, $0' },
  { что: 'Сборка рилса', как: 'локальный Remotion/ffmpeg' },
]

/**
 * Paid work: costs the person tokens (bought with Telegram Stars) and costs
 * us money at the provider.
 *
 * THE PRICE HERE IS NOT TYPED BY HAND, AND THAT IS NOT PEDANTRY. It used to
 * read 1 / 6 / 20 / 1 -- EXACTLY HALF of what `spendTokens` takes. The
 * owner's markup constant (x2, billing-shared) reached the charge and
 * reached no shop window at all: the agent said "video 20" and the wallet
 * paid 40. Measured by running the code on 2026-09-08: all FOUR rows
 * disagreed, each by exactly the markup.
 *
 * So the number comes from the same `priceFor` the charge does. The next
 * change of markup or cost travels into the conversation by itself -- there
 * is no hand left to forget it.
 */
export const PAID = [
  {
    функция: 'image_generate',
    токенов: priceFor('image_generate'),
    провайдер: 'Replicate flux-schnell (или FAL при оплате)',
  },
  {
    функция: 'audio_generate',
    токенов: priceFor('audio_generate'),
    провайдер: 'Replicate minimax / ElevenLabs',
  },
  {
    функция: 'video_generate',
    токенов: priceFor('video_generate'),
    провайдер: 'Replicate seedance-1-lite',
  },
  {
    функция: 'reel_render',
    токенов: priceFor('reel_render'),
    провайдер: 'локальный Remotion (в проде дом-аккаунту бесплатно)',
  },
  /**
   * Lipsync is charged PER SECOND of audio, and it was missing from the
   * price list entirely -- the one operation whose bill grows with the
   * length of the input was the one nobody was quoted before pressing.
   */
  {
    функция: 'lipsync_generate', // cyrillic-ok: existing field name
    токенов: priceFor('lipsync_generate'),
    единица: 'за секунду звука', // cyrillic-ok: existing field name
    провайдер: 'Kie infinitalk (from-audio)',
  },
]

/** Как настроить каждого провайдера. Статус — из живого аудита. */
export const PROVIDERS: Record<
  string,
  {
    даёт: string
    статус: 'работает' | 'нужна оплата' | 'нужен ключ'
    env: string
    как: string
    стоимость: string
    заметка?: string
  }
> = {
  replicate: {
    даёт: 'картинки (flux), видео (seedance), озвучка (minimax) — основной рабочий провайдер',
    статус: 'работает',
    env: 'REPLICATE_API_TOKEN',
    как: 'Ключ в replicate.com/account/api-tokens; пополнение — replicate.com/account/billing',
    стоимость: 'pay-as-you-go: картинка ~$0.003, видео ~$0.1',
    заметка: 'ОПЛАЧЕН и отдаёт реальный вывод — на нём держится таб с ИИ',
  },
  fal: {
    даёт: 'доп. картинки (nano-banana-pro) и липсинк из фото+аудио (veed/fabric-1.0)',
    статус: 'нужна оплата',
    env: 'FAL_KEY',
    как: 'Пополнить баланс на fal.ai/dashboard/billing; ключ — fal.ai/dashboard/keys',
    стоимость: 'pay-as-you-go',
    заметка:
      'Сейчас «User locked: Exhausted balance». Модели существуют — оплата оживит.',
  },
  elevenlabs: {
    даёт: 'премиум-озвучка и клон голоса',
    статус: 'нужен ключ',
    env: 'ELEVENLABS_API_KEY',
    как: 'В кабинете ElevenLabs → Profile → API Key. Настоящий ключ начинается с «sk_».',
    стоимость: 'по подписке ElevenLabs',
    заметка:
      'Сейчас в переменной идентификатор, а не sk_-ключ. Либо используйте Replicate-озвучку (без ElevenLabs).',
  },
  glm: {
    даёт: 'агент/текст (флэт-рейт, работает); картинки CogView и видео CogVideoX — при мультимодал-пакете',
    статус: 'нужна оплата',
    env: 'GLM_API_KEY',
    как: 'Докупить resource package на аккаунте z.ai. Для картинок — модель cogview-4-250304 или glm-image; для видео — cogvideox-3.',
    стоимость: 'флэт-рейт (текст) + пакет на картинки/видео',
    заметка:
      'НЕ использовать cogview-3-flash — «Unknown Model». Текст уже работает.',
  },
  openai: {
    даёт: 'расшифровка (Whisper), зрение (GPT-4V), улучшение промпта — опционально',
    статус: 'нужен ключ',
    env: 'OPENAI_API_KEY',
    как: 'platform.openai.com/api-keys',
    стоимость: 'pay-as-you-go',
  },
  pollinations: {
    даёт: 'бесплатный img2img (сцены из фото)',
    статус: 'работает',
    env: '(ключ не нужен)',
    как: 'Ничего настраивать не надо — keyless HTTP',
    стоимость: '$0',
    заметка: 'Держит образ персонажа, не точное лицо 1:1',
  },
}

/** Сводка бесплатное/платное — для инструмента pricing. */
export function pricingSummary() {
  return {
    бесплатно: FREE,
    платно: PAID,
    как_платить:
      'Токены покупаются за Telegram Stars — это ЕДИНСТВЕННЫЙ способ платить. ' +
      'Тарифов, подписок и клуба нет; провайдеров держим мы, человеку свои ключи ' +
      'не нужны.',
    подсказка:
      'Ценность — в агенте-студии: рилсы в стиле и голосе человека, лента, охваты, ' +
      'производство на потоке. Бесплатная проба — витрина качества (сценарий, ' +
      'разбор, черновик). Токенами платят реальные генерации картинок/видео/' +
      'озвучки. Кончились — выпиши счёт (tokens_invoice), не отправляй «оформлять ' +
      'подписку». Не продавай «дёшево» — продавай результат.',
  }
}

/** Инструкция по настройке провайдера (или всех). */
export function providerSetup(name?: string) {
  if (!name)
    return {
      провайдеры: PROVIDERS,
      совет: 'Начни с Replicate (уже работает) или Pollinations (бесплатно).',
    }
  const key = name.toLowerCase().replace(/[^a-z]/g, '')
  const p = PROVIDERS[key]
  if (!p) {
    return {
      ошибка: `провайдер «${name}» неизвестен`,
      доступные: Object.keys(PROVIDERS),
    }
  }
  return { провайдер: key, ...p }
}
