export interface KieWebModel {
  id: string
  name: string
  description: string
}

/** Small reviewed surface; the server still validates every id and payload. */
export const KIE_WEB_MODELS: Record<
  'image' | 'video' | 'audio' | 'lipsync',
  readonly KieWebModel[]
> = {
  image: [
    {
      id: 'kie/google/nano-banana',
      name: 'Kie · Nano Banana',
      description: 'Экономная генерация через Kie.ai',
    },
  ],
  /*
   * GROK IMAGINE IS NOT SOLD ANY MORE, so the web does not offer it.
   *
   * Its price is per second and its request carries no length: the provider
   * picks 6 to 30 seconds and the server charged ONE (5 tokens for a clip
   * billed up to $0.36). The server's video floor refuses such a model before
   * any charge (render billing-shared.ts, `kieVideoSale`).
   *
   * Hailuo 02 Pro takes the place because its bill is fixed by the model
   * itself: a prompt in, one 6-second 1080p clip out, one row of the price
   * list ($0.285). The server prices it from that row.
   */
  video: [
    {
      id: 'kie/hailuo/02-text-to-video-pro',
      name: 'Kie · Hailuo 02 Pro',
      description: 'Текст в видео через Kie.ai: 6 с, 1080p',
    },
  ],
  audio: [
    {
      id: 'kie/elevenlabs/text-to-speech-multilingual-v2',
      name: 'Kie · Multilingual Voice',
      description: 'Запасной TTS через Kie.ai',
    },
  ],
  /**
   * ЛИПСИНК В ВЕБЕ НЕ РАБОТАЛ ВООБЩЕ — И НЕ ИЗ-ЗА ПРОВАЙДЕРА.
   *
   * Здесь стоял `kie/veed/fabric-1`, единственная модель вкладки. Сервер её
   * НЕ ДОПУСКАЕТ: допуск отсеивает всё, чему KieAI не назвал себестоимость
   * (`priceForKieModel(id) == null`, kie-web-provider.ts), а семейство veed в
   * прайсе отсутствует целиком — проверено перебором всех 467 строк.
   *
   * Что происходило на каждом нажатии: маршрут мерил длину звука, заводил
   * задачу, СПИСЫВАЛ деньги — и `reviewedKieModel` бросал «Kie.ai model is
   * not enabled for lipsync». Дальше возврат и 500 с этой же строкой на
   * экране. Деньги возвращались, работа не делалась ни разу, а человек читал
   * фразу, из которой не следует ни одного действия.
   *
   * Откуда взялось: 02.09 модель попала сюда, 04.09 серверная сторона ушла на
   * InfiniTalk и вместе с ней уехала себестоимость операции (0.09 → 0.015,
   * коммит 6d0cd04c6). Тот коммит прямо пишет, что источник цены обязан
   * совпадать с моделью из этого файла, — и этот файл не тронул.
   *
   * InfiniTalk и есть та модель, на которую сервер молча подменял выбор
   * (`KIE_LIPSYNC[0]`), и та, под которую посчитана цена: $0.015 за секунду,
   * 6 токенов. Цена для человека не меняется — меняется то, что вкладка
   * начинает работать.
   */
  lipsync: [
    {
      id: 'kie/infinitalk/from-audio',
      name: 'Kie · InfiniTalk',
      description: 'Говорящий портрет по фото и голосу',
    },
  ],
}

export function kieServerModelId(id: string): string | null {
  if (!id.startsWith('kie/')) return null
  const model = id.slice(4).trim()
  return model.length > 0 ? model : null
}
