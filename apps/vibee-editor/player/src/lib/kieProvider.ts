import type { Voice } from '../atoms/voices'

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
  video: [
    {
      id: 'kie/grok-imagine/text-to-video',
      name: 'Kie · Grok Imagine',
      description: 'Текст в видео через Kie.ai',
    },
  ],
  audio: [
    {
      id: 'kie/elevenlabs/text-to-speech-multilingual-v2',
      name: 'Kie · Multilingual Voice',
      description: 'Primary TTS through Kie.ai',
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

export const DEFAULT_AUDIO_MODEL = KIE_WEB_MODELS.audio[0].id

/** Documented Kie stock voice; never reuse a Direct/MiniMax cached voice.
 * https://docs.kie.ai/market/elevenlabs/text-to-speech-multilingual-v2
 * This is not an owner voice clone. Expand only with verified model voices.
 */
export const KIE_AUDIO_VOICES: Voice[] = [
  { id: 'Rachel', name: 'Rachel', category: 'premade' },
]

export function kieServerModelId(id: string): string | null {
  if (!id.startsWith('kie/')) return null
  const model = id.slice(4).trim()
  return model.length > 0 ? model : null
}
