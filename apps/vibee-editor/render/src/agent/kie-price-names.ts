/**
 * Наш идентификатор модели → её имя в прайсе KieAI.
 *
 * СПИСОК СОСТАВЛЕН РУКАМИ, И ЭТО НЕ ЛЕНЬ, А ВЫВОД ИЗ ОШИБКИ.
 *
 * Прайс отдаёт витринные имена («Kling 2.1»), а мы храним ключи API
 * («kling/v2-1-pro»). Соблазн сопоставить их мерой похожести велик и
 * обманчив: проверенная на этих самых данных эвристика по совпадению
 * токенов выдала «kling/v2-1-pro» → «Black Forest Labs flux-2 pro» и
 * «sora-2-text-to-video» → «Elevenlabs Text to Speech». Показанная
 * человеку чужая цена хуже отсутствующей: по отсутствующей он спросит,
 * а по чужой — примет решение.
 *
 * `null` значит «в прайсе KieAI этой модели нет», а не «мы не нашли».
 * Проверено перебором всех 467 строк: семейства sora и veed там
 * отсутствуют целиком.
 *
 * Источник: POST https://api.kie.ai/client/v1/model-pricing/page
 * ({ pageNum, pageSize }, не больше 100 на страницу). Снято 01.09.2026.
 */
export const ИМЯ_В_ПРАЙСЕ: Record<string, string | null> = {
  // — картинка —
  'seedream/5-lite-text-to-image': 'seedream 5.0 Lite',
  'seedream/5-pro-text-to-image': 'seedream 5 Pro',
  'seedream/5-pro-image-to-image': 'seedream 5 Pro',
  'google/imagen4-fast': 'google imagen4, text-to-image, Fast',
  'google/imagen4-ultra': 'google imagen4, text-to-image, Ultra',
  'google/imagen4': 'google imagen4, text-to-image, default',
  'google/nano-banana-edit': 'Google nano banana edit',
  'google/nano-banana': 'Google nano banana',
  'grok-imagine/text-to-image': 'grok-imagine-image-2-0',
  'grok-imagine/image-to-image': 'grok-imagine-image-2-0',
  'topaz/image-upscale': 'Topaz Image Upscaler',
  'recraft/remove-background': 'Recraft Remove Background',
  'recraft/crisp-upscale': 'Recraft Crisp Upscale',
  'ideogram/v3-text-to-image': 'ideogram v3',
  'ideogram/character': 'ideogram character',
  'qwen/text-to-image': 'Qwen Image',
  'qwen/image-edit': 'Qwen image-edit',
  'qwen3/text-to-image': 'Qwen image 3.0',
  'wan/2-7-image': 'wan 2.7 image',

  // — видео —
  'grok-imagine/text-to-video':
    'grok-imagine-video-1-5-preview, image-to-video, 480p',
  'grok-imagine/image-to-video':
    'grok-imagine-video-1-5-preview, image-to-video, 480p',
  'kling/ai-avatar-standard': 'Kling AI Avtar',
  'kling/v2-1-pro': 'Kling 2.1',
  'kling/v3-turbo-text-to-video': 'kling 3.0 turbo',
  'bytedance/seedance-2': 'bytedance/seedance-2',
  'bytedance/seedance-2-fast': 'bytedance/seedance-2 fast',
  'bytedance/v1-pro-text-to-video': 'bytedance/seedance-1.5-pro',
  'hailuo/02-text-to-video-pro': 'hailuo 02',
  'wan/2-5-text-to-video': 'wan 2.5',
  'wan/2-6-text-to-video': 'wan 2.6',
  'wan/3-0-video': 'wan 3.0 video',
  'topaz/video-upscale': 'Topaz Video Upscaler',
  'minimax-h3/text-to-video': 'MiniMax H3',

  // — липсинк —
  // Витринное имя ничем не напоминает ключ — как раз тот случай,
  // где всякий автоподбор промахнулся бы молча.
  'infinitalk/from-audio': 'MeiGen-AI InfiniteTalk',
  'omnihuman-1-5': 'omnihuman-1-5',
  'volcengine/video-to-video-lip-sync': 'volcengine',

  // — звук —
  'elevenlabs/text-to-speech-multilingual-v2':
    'Elevenlabs Text to Speech, multilingual v2',
  'elevenlabs/text-to-speech-turbo-2-5': 'Elevenlabs Text to Speech, turbo 2.5',
  'elevenlabs/audio-isolation': null,
  'google/gemini-3-1-flash-tts': 'Gemini 3.1 Flash TTS',

  // — в прайсе KieAI отсутствуют —
  // Все три sora приостановлены у провайдера, и цены на них там нет.
  'sora-2-text-to-video': null,
  'sora-2-pro-text-to-video': null,
  'sora-2-image-to-video': null,
  'veed/fabric-1': null,

  // — сценарий —
  // Прайс чат-моделей меряет токенами, а не готовым текстом.
  'gpt-5-2': 'gpt-5-2',
  'gemini-3-pro': 'Gemini 3 Pro',
  'gemini-2.5-flash': 'Gemini 2.5 flash',

  // GLM идёт НЕ через KieAI, а по своей подписке z.ai, и её прайса в
  // выгрузке KieAI нет — потому null, а не выдуманная цифра.
  'glm-5.3': null,
}

/** Адрес прайса. POST, поле страницы называется pageNum, размер ≤ 100. */
/*
 * ИМЕНА УТОЧНЕНЫ ДО СЕГМЕНТА, ОТЛИЧАЮЩЕГО МОДЕЛЬ.
 *
 * Одно имя на несколько наших моделей означало, что цену им выбирает правило
 * «самый дешёвый вариант», а не мы. Замер: Imagen 4 Ultra стоит $0.06, а
 * продавался по цене Fast — $0.02.
 *
 * `elevenlabs/audio-isolation` переведён в `null`: в прайсе KieAI НЕТ строки
 * про выделение голоса вовсе (проверено — ноль совпадений на «isolation»), а
 * стояло имя «Elevenlabs V3», единственная строка которого — «Text to
 * dialogue», то есть ОЗВУЧКА. Мы брали ставку чужого товара, да ещё «за 1000
 * знаков» за обработку аудиофайла, где знаков нет. Без цены модель не
 * продаётся — это честнее, чем счёт, взятый ниоткуда.
 */
/*
 * РАЗРЕШЕНИЕ В ИМЕНИ — НЕ УКРАШЕНИЕ.
 *
 * У grok-imagine в прайсе две строки: 480p за $0.012 и 720p за $0.0225.
 * Правило «бери самый дешёвый вариант» брало 480p, а маршрут — в другом файле
 * — слал `resolution: '480p'`. Сходилось, но СЛУЧАЙНО: поменяйте разрешение в
 * запросе, и цена за ним не поедет, потому что она про это разрешение ничего
 * не знала.
 *
 * Теперь имя называет разрешение прямо, а тест сверяет его с константой,
 * которую шлёт маршрут. Разъедутся — упадёт сборка, а не счёт.
 */
export const АДРЕС_ПРАЙСА = 'https://api.kie.ai/client/v1/model-pricing/page'
