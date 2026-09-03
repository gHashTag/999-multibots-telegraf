export const KIE_WEB_MODEL = Object.freeze({
  image: 'google/nano-banana',
  video: 'grok-imagine/text-to-video',
  audio: 'elevenlabs/text-to-speech-multilingual-v2',
  /**
   * ЛИПСИНК: infinitalk, а не veed/fabric-1.
   *
   * `veed/fabric-1` отвечал `internal error, please try again later` на
   * стороне KieAI — проверено живым запросом с настоящим PNG-портретом и
   * рабочей mp3 (обе ссылки наши, абсолютные). До провайдера запрос доходил:
   * и белый список аргументов, и проверка типа файла были пройдены.
   *
   * В каталоге KieAI пять моделей липсинка. Выбранной оказалась ЕДИНСТВЕННАЯ,
   * у которой прайс не назвал цену вовсе — при том что у остальных четырёх
   * она известна, а самая дешёвая дешевле самой дорогой в девять раз.
   * Неизвестная цена — не мелочь: за неё платит человек, а мы не можем
   * назвать сумму до нажатия.
   *
   * infinitalk/from-audio: $0.015 за секунду — самая дешёвая из пяти, просит
   * ровно то же, что и прежняя (фото + звук), то есть сценарий «оживить
   * портрет голосом» не меняется.
   */
  lipsync: 'infinitalk/from-audio',
})

export type KieWebMediaKind = keyof typeof KIE_WEB_MODEL

/**
 * The browser sends an explicit provider namespace. Only the one reviewed
 * model per media stage may cross the paid provider boundary.
 */
export function reviewedKieModel(
  kind: KieWebMediaKind,
  requested: unknown
): string | null {
  if (typeof requested !== 'string' || !requested.startsWith('kie/')) {
    return null
  }
  const model = requested.slice(4)
  if (model !== KIE_WEB_MODEL[kind]) {
    throw new Error(`Kie.ai model is not enabled for ${kind}`)
  }
  return model
}
