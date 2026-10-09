import { priceFor, priceForModel } from './billing-shared'
import { CLUB_OFFER_WHEN, clubOffer, spacedNumber } from './club-membership'
import { imageChainNote } from '../image-chain'
import * as MEDIA_SPEC from '../spec/agent-media-kie.gen'
import { voiceLooksDown } from './image-health'

/**
 * ЕДИНЫЙ ИСТОЧНИК ПРАВДЫ: что бесплатно, что платно, как настроить провайдеров.
 * Отсюда берут и агент (инструменты pricing/provider_setup), и мини-апп. Рукописный список в двух местах неизбежно разошёлся бы —
 * поэтому один модуль.
 *
 * Проверено живыми вызовами 2026-08-28 (аудит готовности к оплате): каждая
 * интеграция код-корректна, платные провайдеры падают ТОЛЬКО на балансе/ключе,
 * оплата их оживит. Replicate уже оплачен и отдаёт реальный вывод.
 */

/**
 * Бесплатно — в производстве ничего не стоит.
 *
 * TWO ENTRIES HERE WERE CHARGED, AND ONE NAMED A PROVIDER THE CODE NEVER CALLS.
 *
 *  - "Сборка рилса" sat here while `reel_render` charges 2 tokens
 *    (tools.ts, `spendTokens(ctx, 'reel_render')`) -- and while the very
 *    same file listed reel_render under PAID. The list contradicted itself.
 *  - "img2img-сцены из фото — Pollinations FLUX — keyless, $0" was false in
 *    both halves. That provider's HOST appears in no runtime code at all --
 *    only its name, in the provider_setup reference, and a name is not a
 *    call. The img2img that does exist runs on Kie `google/nano-banana-edit`
 *    and is charged as `image_edit` (PAID below). (The host is spelled out
 *    nowhere in this file on purpose: the guard greps these sources for it,
 *    and a comment quoting it reads exactly like a call.)
 *
 * Searched with a positive control before saying "nowhere": the same grep
 * finds `replicate.com` in three runtime files, so it was not silently empty.
 *
 * A free list that names a charged feature is worse than no list: the person
 * reads it, presses, and is billed. Nothing about what is CHARGED changed
 * here -- only what is claimed. The guard is
 * nothing-free-is-charged.test.ts.
 *
 * THE POLLINATIONS HALF FOUND ITS ENDING ON 2026-09-29, AND NOT BY COMING
 * BACK HERE. The provider became real that day -- the free rescue leg of the
 * image chain (src/pollinations-image.ts, keyless GET, priced $0 in
 * image-chain.ts) -- but a picture STILL costs the person the same 2 tokens
 * whichever leg draws: one price per operation is the chain's rule, so
 * "free-for-us" must not be sold as "free-for-you". The entry stays off this
 * list; where it lives is the provider reference below (PROVIDERS), which is
 * about what the PLATFORM can call, not what the person is charged.
 */
export const FREE = [
  {
    что: 'Лента: смотреть, лайкать, ремиксить из готовых файлов',
    как: 'локально, БД',
  },
  {
    что: 'Агент-чат, сценарии, тексты',
    // Not one flat-rate provider: DEFAULT_ORDER in provider.ts is a chain,
    // and its fallbacks are not all flat-rate. Free to the person either
    // way -- no charge sits on the chat path -- but the reason is a chain,
    // not a subscription.
    как: 'цепочка провайдеров, для человека — бесплатно', // cyrillic-ok: field name
  },
  { что: 'SOUL (голос владельца), скиллы, план', как: 'БД' },
  {
    что: 'Блог-рил: текст + барочная гравюра (TrinityBlogReel)',
    как: 'локальный Remotion, без платных генераций',
  },
  {
    // Spec crm-story-reel v8: a client's reel is the story reel; the silent
    // plan reel is made only when the owner names it. No crm_ name here: the
    // price list is also read in a client's DM.
    что: 'Лила: канон плана (leela_plan); рилс клиенту — рилс-история из трёх кадров (шаблон CRM), беззвучный LeelaPlanReel — только если владелец назвал', // cyrillic-ok: field name
    // The canon lookup and the template are free; the mp4 itself still goes
    // through reel_render and is quoted in PAID below like every other render.
    как: 'локальный Remotion + данные канона; сам рендер — по цене reel_render', // cyrillic-ok: field name
  },
]

/**
 * The video line of the price list: the clip the agent orders by default on
 * Kie (agent-media-kie.t27) -- one price per clip, whatever its length.
 */
function videoProviderNote(): string {
  return `Kie ${MEDIA_SPEC.AGENT_VIDEO_MODEL.slice(4)}, ${MEDIA_SPEC.CLIP_SHORT_SECONDS} с, за ролик` // cyrillic-ok: price list copy
}

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
    /*
     * "Replicate flux-schnell (or FAL once paid)" -- and FAL's first model is
     * $0.15 an image against a 2-token price. Topping FAL up would not have
     * bought a better picture at this price, it would have bought a loss. Who
     * draws is now the chain's price floor, and this line reads it.
     */
    провайдер: imageChainNote(), // cyrillic-ok: existing field name
  },
  {
    /*
     * The agent's img2img, the stills of every story reel. It was sold at the
     * text-to-image price above -- 2 tokens against a $0.02 picture -- and it
     * was on no price list at all, so nobody could see it.
     */
    функция: 'image_edit', // cyrillic-ok: existing field name
    токенов: priceFor('image_edit'), // cyrillic-ok: existing field name
    провайдер: 'Kie nano-banana-edit, img2img: кадры рилс-истории', // cyrillic-ok: existing field name
  },
  {
    функция: 'gpt_image_edit', // cyrillic-ok: existing field name
    токенов: priceFor('gpt_image_edit'), // cyrillic-ok: existing field name
    провайдер: 'Kie GPT Image 2.5 (img2img, 1K) — лид-магнит из фото клиента', // cyrillic-ok: existing field name
  },
  {
    функция: 'audio_generate',
    // The agent's default Kie voice (agent-neuro-kie.t27 TTS_DEFAULT_MODEL),
    // per started 1000 characters (speech_units); a clone is the same price.
    токенов: priceFor('audio_generate'),
    единица: 'за 1000 знаков', // cyrillic-ok: existing field name
    провайдер: 'Kie ElevenLabs turbo 2.5; multilingual v2 — дороже', // cyrillic-ok: existing field name
  },
  {
    функция: 'video_generate',
    // The agent's default clip on Kie (agent-media-kie.t27), priced by the
    // same priceForModel its charge reads: the old flat Replicate number is
    // a price nobody is charged since video moved to Kie.
    токенов: priceForModel('video_generate', MEDIA_SPEC.AGENT_VIDEO_MODEL) ?? 0, // cyrillic-ok: existing field name
    провайдер: videoProviderNote(), // cyrillic-ok: existing field name
  },
  {
    функция: 'reel_render',
    токенов: priceFor('reel_render'),
    провайдер: 'локальный Remotion (в проде дом-аккаунту бесплатно)',
  },
  /**
   * One Suno request on Kie (agent-neuro-kie.t27): the provider picks the
   * length, so it is one price per song, whatever the length.
   */
  {
    функция: 'music_generate', // cyrillic-ok: existing field name
    токенов: priceFor('music_generate'), // cyrillic-ok: existing field name
    единица: 'за песню (Suno пишет два варианта)', // cyrillic-ok: existing field name
    провайдер: 'Kie Suno', // cyrillic-ok: existing field name
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
    провайдер: 'Kie kling/ai-avatar-standard', // cyrillic-ok: existing field name
  },
  /**
   * A client's voice from the voice notes she sent (crm_voice_clone). Once
   * per person: a clone already made answers without a charge.
   */
  {
    функция: 'voice_clone', // cyrillic-ok: existing field name
    токенов: priceFor('voice_clone'), // cyrillic-ok: existing field name
    единица: 'за клон голоса, один раз на человека', // cyrillic-ok: existing field name
    провайдер: 'Replicate minimax/voice-cloning', // cyrillic-ok: existing field name
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
    даёт: 'картинки (flux), видео (seedance), голос клиента и его клон (minimax) — основной рабочий провайдер', // cyrillic-ok: existing reference field
    статус: 'работает',
    env: 'REPLICATE_API_TOKEN',
    как: 'Ключ в replicate.com/account/api-tokens; пополнение — replicate.com/account/billing',
    стоимость: 'pay-as-you-go: картинка ~$0.003, видео ~$0.1, клон голоса $3',
    заметка:
      'Есть ли на нём деньги, видно только по реальному вызову: проверка аккаунта отвечает 200 ' + // cyrillic-ok: reference copy
      'и без денег. Статус выше — из последнего реального вызова голоса.', // cyrillic-ok: reference copy
  },
  fal: {
    даёт: 'доп. картинки (nano-banana-pro) и липсинк из фото+аудио (veed/fabric-1.0)',
    статус: 'нужна оплата',
    env: 'FAL_KEY',
    как: 'Пополнить баланс на fal.ai/dashboard/billing; ключ — fal.ai/dashboard/keys',
    стоимость: 'pay-as-you-go',
    заметка:
      'Сейчас «User locked: Exhausted balance». Картинки FAL дороже цены картинки, ' + // cyrillic-ok: reference copy
      'и цепочка их пропускает: пополнение баланса само их не оживит, нужна другая цена.', // cyrillic-ok: reference copy
  },
  elevenlabs: {
    даёт: 'библиотечные голоса и клон владельца вне дома — НЕ голос клиента (он на Replicate)', // cyrillic-ok: existing reference field
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
  /*
   * KIE WAS PINGED AND UNLISTED, WHICH IS THE WORST OF BOTH.
   *
   * `providers_status` has checked Kie for a while ("Kie.ai — media
   * pipeline", credits endpoint) and counts it among the working ones. This
   * reference -- the one that says what a provider GIVES and how to fix it --
   * did not mention it at all. So the owner reading "which providers do I
   * have" saw six, and not the one his first move to a new client runs on.
   *
   * Measured 2026-09-16: 4947 credits on the account, roughly 820 lead
   * magnets at 6 credits per 1K image-to-image.
   */
  kie: {
    // cyrillic-ok: this reference map has Russian field names throughout
    даёт: 'подарок-портрет из аватарки (gpt-image-2-5-flare, img2img), липсинк kling ai-avatar', // cyrillic-ok
    статус: 'работает', // cyrillic-ok
    env: 'KIE_AI_API_KEY',
    как: 'Ключ и пополнение — kie.ai; баланс виден на GET api.kie.ai/api/v1/chat/credit', // cyrillic-ok
    // cyrillic-ok
    // cyrillic-ok
    стоимость:
      'кредиты: img2img 1K = 6 кредитов (~$0.03), 2K = $0.05, 4K = $0.08', // cyrillic-ok
    // cyrillic-ok
    // cyrillic-ok
    заметка:
      'НА НЁМ ЛИД-МАГНИТ ПРОДАВЦА. Замер 16.09.2026: 4947 кредитов (~820 подарков). ' + // cyrillic-ok
      'Живой запуск из нашего кода — 16.09.2026: 75 с, 6 кредитов, лицо сохранено.', // cyrillic-ok
  },
  pollinations: {
    // cyrillic-ok: this reference map has Russian field names throughout
    даёт: 'бесплатные text-to-image — спасательное звено цепочки image_generate (после платных FAL/Replicate, до Kie)', // cyrillic-ok
    статус: 'работает', // cyrillic-ok
    env: '(ключ не нужен)', // cyrillic-ok
    как: 'Ничего настраивать не надо — keyless HTTP', // cyrillic-ok
    стоимость: '$0', // cyrillic-ok
    заметка:
      'Подключено 2026-09-29: пока платные кошельки отказывают (FAL locked, Replicate без денег), ' + // cyrillic-ok
      'картинки рисует оно. Человек платит те же 2 токена — бесплатно это для платформы, не для него. ' + // cyrillic-ok
      'Качество ниже платных; img2img-пути у нас нет и не было — прежняя карточка его обещала зря.', // cyrillic-ok
  },
}

/**
 * The club as the price list shows it, from the one source in
 * club-membership.ts. It used to be absent here -- worse, this summary said
 * in words that there was no club, while the prompt sold it: the agent was
 * told to call `pricing` and `pricing` contradicted it (measured 2026-09-22:
 * zero answers in thirty days named the club's price).
 */
function clubEntry() {
  const o = clubOffer()
  return {
    что: o.inside, // cyrillic-ok: field name
    цена: `${spacedNumber(o.stars)} ⭐ за ${o.periodDays} дней`, // cyrillic-ok: price list copy
    возврат: `${o.sharePercent}% каждого платежа токенами: ${spacedNumber(o.back)}`, // cyrillic-ok: price list copy
    как_вступить: o.join, // cyrillic-ok: field name
    бесплатно: o.free, // cyrillic-ok: field name
    когда_называть: CLUB_OFFER_WHEN, // cyrillic-ok: field name
  }
}

/**
 * Сводка бесплатное/платное — для инструмента pricing.
 *
 * `surface` is where the question came from. The client in the owner's DM
 * ('business') buys pictures, not a twin: the club is not sold there (the DM
 * prompt says the same), so that one surface gets the tokens and no club.
 */
export function pricingSummary(surface?: string) {
  const dm = surface === 'business'
  return {
    бесплатно: FREE,
    платно: PAID,
    ...(dm ? {} : { клуб: clubEntry() }), // cyrillic-ok: field name
    как_платить: dm
      ? 'Клиенту — только токены за звёзды Telegram: каждая генерация списывается с ' + // cyrillic-ok: price list copy
        'баланса. Клуб в личке не предлагается. Провайдеров держим мы, свои ключи не нужны.' // cyrillic-ok: price list copy
      : 'Две вещи и только они. Токены за звёзды Telegram — с них списывается каждая ' + // cyrillic-ok: price list copy
        'генерация. И одна подписка — клуб (см. «клуб»). Других тарифов, подписок и ' + // cyrillic-ok: price list copy
        'долларовых цен нет; провайдеров держим мы, человеку свои ключи не нужны.', // cyrillic-ok: price list copy
    подсказка:
      'Ценность — в агенте-студии: рилсы в стиле и голосе человека, лента, охваты, ' +
      'производство на потоке. Бесплатная проба — витрина качества (сценарий, ' +
      'разбор, черновик). Токенами платят реальные генерации картинок/видео/' +
      'озвучки. Кончились — скажи честно; хочет продолжить — выпиши счёт на токены ' + // cyrillic-ok: price list copy
      '(tokens_invoice), клуб вместо пополнения не подсовывай. Не продавай «дёшево» — ' + // cyrillic-ok: price list copy
      'продавай результат.', // cyrillic-ok: price list copy
  }
}

/** Инструкция по настройке провайдера (или всех). */
/**
 * The reference card with Replicate's state as the last real call left it.
 * The card is typed text; Replicate's own account check answers 200 with no
 * credit, so "works" here said nothing about money -- on 2026-09-27 it read
 * "works, PAID" while every clone met a 402 (image-health.ts).
 */
function withLiveState(): Record<string, (typeof PROVIDERS)[string]> {
  const down = voiceLooksDown()
  if (!down) return PROVIDERS
  return {
    ...PROVIDERS,
    replicate: {
      ...PROVIDERS.replicate,
      статус: 'нужна оплата', // cyrillic-ok: reference copy
      заметка: `Реальный вызов ${down.minutesAgo} мин назад: ${down.why}. Пополнить баланс Replicate.`, // cyrillic-ok: reference copy
    },
  }
}

export function providerSetup(name?: string) {
  const providers = withLiveState()
  if (!name)
    return {
      провайдеры: providers,
      совет:
        providers.replicate.статус === 'работает' // cyrillic-ok: existing reference field
          ? 'Начни с Replicate (отказов не было) или Pollinations (бесплатно).' // cyrillic-ok: reference copy
          : 'Replicate без денег — пополни его; бесплатно работает Pollinations.', // cyrillic-ok: reference copy
    }
  const key = name.toLowerCase().replace(/[^a-z]/g, '')
  const p = providers[key]
  if (!p) {
    return {
      ошибка: `провайдер «${name}» неизвестен`,
      доступные: Object.keys(PROVIDERS),
    }
  }
  return { провайдер: key, ...p }
}
