import SwiftUI

/**
 * Каталог KieAI на устройстве — 49 моделей, СГЕНЕРИРОВАН.
 *
 * НЕ ПРАВИТЬ РУКАМИ: правка исчезнет при следующем запуске
 * `apps/vibee-editor/render/scripts/gen-kie-swift.ts`.
 *
 * ТРИ ИСТОЧНИКА, ВСЕ ДОБЫТЫ ЗАМЕРОМ:
 *   • умения и живость — `kie-models.ts` (дословные ответы createTask);
 *   • цена — прайс KieAI (POST model-pricing/page), снят при генерации;
 *   • связь между ними — `kie-price-names.ts`, список составлен руками.
 *
 * ПРО ЦЕНУ. Показан САМЫЙ ДЕШЁВЫЙ вариант модели, поэтому в интерфейсе он
 * идёт со словом «от»: у одной модели бывает восемь цен на разные
 * разрешения и длительности. Единица важна не меньше суммы — «$0.09 за
 * секунду» и «$0.09 за ролик» отличаются в разы. Для 10 моделей цены в
 * прайсе KieAI нет вовсе (все приостановлены), и там стоит nil — это
 * «провайдер не назвал», а не «мы не нашли».
 *
 * ПРО `опасная`. grok-imagine/image-to-video не проверяет вход и СОЗДАЁТ
 * задание даже на пустой запрос. Разведка по ней стоила денег дважды.
 */

struct Модель: Identifiable, Hashable {
  let id: String
  let название: String
  let вид: Вид
  let живая: Bool
  /// Что нужно на вход — словами самого API, переведёнными для человека.
  let требует: String
  /// Принимает пустой вход и берёт деньги. Не пробовать автоматически.
  let опасная: Bool
  /// Цена самого дешёвого варианта в долларах. nil — прайс её не называет.
  let ценаUSD: Double?
  /// За что берут: «за ролик», «за секунду», «за 1000 знаков».
  let единица: String?
  /**
   * Просит вход, которого экран пока не передаёт (картинку, видео, звук).
   *
   * Такая модель не сработает НИКОГДА: сервер соберёт заявку и получит null
   * уже после того, как человек нажал и заплатил. Их было семь — по одной-две
   * на каждой платной вкладке, и строка честно писала «нужно: картинку»,
   * отправляя запрос без неё.
   *
   * Значение считает генератор по тому же списку полей, что и допуск на
   * сервере, поэтому экран и сервер не могут разойтись. Появится загрузка —
   * признак сам станет `false`, без правки экрана.
   */
  var входИзвне: Bool = false
  /**
   * Просит ФАЙЛ ОТ ЧЕЛОВЕКА: картинку, видео или звук.
   *
   * Не путать с `входИзвне`. Тот означает «маршрут это передать не умеет,
   * модель не показываем». Этот — «умеет, но сначала выберите файл»: модель
   * видна, а кнопка ждёт выбора, как ждёт непустого описания.
   */
  var нуженИсходник: Bool = false
  /// Какой файл просит: «фото», «видео» или «звук». Показать выбор фотографий
  /// там, где нужен ролик, — предложить работу, которая не сработает.
  var видИсходника: String? = nil

  enum Вид: String, CaseIterable { case картинка, видео, звук, липсинк, сценарий }

  var почемуНельзя: String? {
    живая ? nil : "Приостановлена у провайдера — не в вашем аккаунте. Появится сама."
  }

  /// Готовая подпись для экрана. «от» — потому что показан минимум.
  var ценник: String? {
    guard let ценаUSD, let единица else { return nil }
    let сумма = ценаUSD < 0.01
      ? String(format: "%.4f", ценаUSD)
      : String(format: "%.2f", ценаUSD)
    return "от $\(сумма) \(единица)"
  }
}

enum КаталогKie {
  static let все: [Модель] = [
    Модель(id: "gpt-image-2-5-flare-image-to-image", название: "Портрет из фото — подарок", вид: .картинка, живая: true, требует: "описание", опасная: true, ценаUSD: 0.03, единица: "за картинку", входИзвне: true, нуженИсходник: true, видИсходника: "фото"), // cyrillic-ok: generated UI catalogue
    Модель(id: "seedream/5-lite-text-to-image", название: "Seedream 5 Lite — картинка", вид: .картинка, живая: true, требует: "описание", опасная: false, ценаUSD: 0.0275, единица: "за картинку", входИзвне: false, нуженИсходник: false, видИсходника: nil), // cyrillic-ok: generated UI catalogue
    Модель(id: "seedream/5-pro-text-to-image", название: "Seedream 5 Pro — картинка", вид: .картинка, живая: true, требует: "описание", опасная: false, ценаUSD: 0.035, единица: "за картинку", входИзвне: false, нуженИсходник: false, видИсходника: nil), // cyrillic-ok: generated UI catalogue
    Модель(id: "seedream/5-pro-image-to-image", название: "Seedream 5 Pro — правка картинки", вид: .картинка, живая: true, требует: "описание + фото", опасная: false, ценаUSD: 0.035, единица: "за картинку", входИзвне: false, нуженИсходник: true, видИсходника: "фото"), // cyrillic-ok: generated UI catalogue
    Модель(id: "google/imagen4-fast", название: "Imagen 4 Fast — картинка", вид: .картинка, живая: true, требует: "описание", опасная: false, ценаUSD: 0.02, единица: "за запрос", входИзвне: false, нуженИсходник: false, видИсходника: nil), // cyrillic-ok: generated UI catalogue
    Модель(id: "google/imagen4-ultra", название: "Imagen 4 Ultra — картинка", вид: .картинка, живая: true, требует: "описание", опасная: false, ценаUSD: 0.06, единица: "за картинку", входИзвне: false, нуженИсходник: false, видИсходника: nil), // cyrillic-ok: generated UI catalogue
    Модель(id: "google/imagen4", название: "Imagen 4 — картинка", вид: .картинка, живая: true, требует: "описание", опасная: false, ценаUSD: 0.04, единица: "за запрос", входИзвне: false, нуженИсходник: false, видИсходника: nil), // cyrillic-ok: generated UI catalogue
    Модель(id: "google/nano-banana-edit", название: "Nano Banana — правка картинки", вид: .картинка, живая: true, требует: "описание", опасная: false, ценаUSD: 0.02, единица: "за картинку", входИзвне: false, нуженИсходник: false, видИсходника: nil), // cyrillic-ok: generated UI catalogue
    Модель(id: "google/nano-banana", название: "Nano Banana — картинка", вид: .картинка, живая: true, требует: "описание", опасная: false, ценаUSD: 0.02, единица: "за картинку", входИзвне: false, нуженИсходник: false, видИсходника: nil), // cyrillic-ok: generated UI catalogue
    Модель(id: "grok-imagine/text-to-image", название: "Grok Imagine — картинка", вид: .картинка, живая: true, требует: "описание", опасная: false, ценаUSD: 0.02, единица: "за картинку", входИзвне: false, нуженИсходник: false, видИсходника: nil), // cyrillic-ok: generated UI catalogue
    Модель(id: "grok-imagine/image-to-image", название: "Grok Imagine — правка картинки", вид: .картинка, живая: true, требует: "фото", опасная: false, ценаUSD: 0.02, единица: "за картинку", входИзвне: false, нуженИсходник: true, видИсходника: "фото"), // cyrillic-ok: generated UI catalogue
    Модель(id: "topaz/image-upscale", название: "Topaz — увеличить картинку", вид: .картинка, живая: true, требует: "фото", опасная: false, ценаUSD: 0.05, единица: "за картинку", входИзвне: false, нуженИсходник: true, видИсходника: "фото"), // cyrillic-ok: generated UI catalogue
    Модель(id: "recraft/remove-background", название: "Recraft — убрать фон", вид: .картинка, живая: true, требует: "картинку", опасная: false, ценаUSD: 0.005, единица: "за картинку", входИзвне: false, нуженИсходник: true, видИсходника: "фото"), // cyrillic-ok: generated UI catalogue
    Модель(id: "recraft/crisp-upscale", название: "Recraft — увеличить резко", вид: .картинка, живая: true, требует: "картинку", опасная: false, ценаUSD: 0.0025, единица: "за картинку", входИзвне: false, нуженИсходник: true, видИсходника: "фото"), // cyrillic-ok: generated UI catalogue
    Модель(id: "ideogram/v3-text-to-image", название: "Ideogram v3 — картинка", вид: .картинка, живая: true, требует: "описание", опасная: false, ценаUSD: 0.0175, единица: "за картинку", входИзвне: false, нуженИсходник: false, видИсходника: nil), // cyrillic-ok: generated UI catalogue
    Модель(id: "ideogram/character", название: "Ideogram — персонаж", вид: .картинка, живая: true, требует: "описание", опасная: false, ценаUSD: 0.06, единица: "за картинку", входИзвне: false, нуженИсходник: false, видИсходника: nil), // cyrillic-ok: generated UI catalogue
    Модель(id: "qwen/text-to-image", название: "Qwen — картинка", вид: .картинка, живая: true, требует: "описание", опасная: false, ценаUSD: 0.02, единица: "за мегапиксель", входИзвне: false, нуженИсходник: false, видИсходника: nil), // cyrillic-ok: generated UI catalogue
    Модель(id: "qwen/image-edit", название: "Qwen — правка картинки", вид: .картинка, живая: true, требует: "описание", опасная: false, ценаUSD: 0.03, единица: "за мегапиксель", входИзвне: false, нуженИсходник: false, видИсходника: nil), // cyrillic-ok: generated UI catalogue
    Модель(id: "qwen3/text-to-image", название: "Qwen 3 — картинка", вид: .картинка, живая: true, требует: "описание", опасная: false, ценаUSD: 0.0025, единица: "за картинку", входИзвне: false, нуженИсходник: false, видИсходника: nil), // cyrillic-ok: generated UI catalogue
    Модель(id: "wan/2-7-image", название: "Wan 2.7 — картинка", вид: .картинка, живая: true, требует: "описание", опасная: false, ценаUSD: 0.024, единица: "за картинку", входИзвне: false, нуженИсходник: false, видИсходника: nil), // cyrillic-ok: generated UI catalogue
    Модель(id: "grok-imagine/text-to-video", название: "Grok Imagine — видео по тексту", вид: .видео, живая: true, требует: "описание", опасная: false, ценаUSD: 0.012, единица: "за секунду", входИзвне: false, нуженИсходник: false, видИсходника: nil), // cyrillic-ok: generated UI catalogue
    Модель(id: "grok-imagine/image-to-video", название: "Grok Imagine — видео из фото", вид: .видео, живая: true, требует: "—", опасная: true, ценаUSD: 0.012, единица: "за секунду", входИзвне: false, нуженИсходник: false, видИсходника: nil), // cyrillic-ok: generated UI catalogue
    Модель(id: "kling/ai-avatar-standard", название: "Kling — говорящий аватар", вид: .липсинк, живая: true, требует: "фото", опасная: false, ценаUSD: 0.04, единица: "за секунду", входИзвне: false, нуженИсходник: true, видИсходника: "фото"), // cyrillic-ok: generated UI catalogue
    Модель(id: "kling/v2-1-pro", название: "Kling 2.1 Pro — видео", вид: .видео, живая: true, требует: "описание + фото", опасная: false, ценаUSD: 0.125, единица: "за ролик", входИзвне: false, нуженИсходник: true, видИсходника: "фото"), // cyrillic-ok: generated UI catalogue
    Модель(id: "kling/v3-turbo-text-to-video", название: "Kling 3 Turbo — видео по тексту", вид: .видео, живая: true, требует: "описание", опасная: false, ценаUSD: 0.09, единица: "за секунду", входИзвне: false, нуженИсходник: false, видИсходника: nil), // cyrillic-ok: generated UI catalogue
    Модель(id: "bytedance/seedance-2", название: "Seedance 2 — видео", вид: .видео, живая: true, требует: "описание", опасная: false, ценаUSD: 0.057, единица: "за секунду", входИзвне: false, нуженИсходник: false, видИсходника: nil), // cyrillic-ok: generated UI catalogue
    Модель(id: "bytedance/seedance-2-fast", название: "Seedance 2 Fast — видео", вид: .видео, живая: true, требует: "описание", опасная: false, ценаUSD: 0.034, единица: "за секунду", входИзвне: false, нуженИсходник: false, видИсходника: nil), // cyrillic-ok: generated UI catalogue
    Модель(id: "bytedance/v1-pro-text-to-video", название: "ByteDance v1 Pro — видео по тексту", вид: .видео, живая: true, требует: "описание", опасная: false, ценаUSD: 0.00875, единица: "за секунду", входИзвне: false, нуженИсходник: false, видИсходника: nil), // cyrillic-ok: generated UI catalogue
    Модель(id: "hailuo/02-text-to-video-pro", название: "Hailuo 02 Pro — видео по тексту", вид: .видео, живая: true, требует: "описание", опасная: false, ценаUSD: 0.06, единица: "за ролик", входИзвне: false, нуженИсходник: false, видИсходника: nil), // cyrillic-ok: generated UI catalogue
    Модель(id: "wan/2-5-text-to-video", название: "Wan 2.5 — видео по тексту", вид: .видео, живая: true, требует: "описание", опасная: false, ценаUSD: 0.3, единица: "за ролик", входИзвне: false, нуженИсходник: false, видИсходника: nil), // cyrillic-ok: generated UI catalogue
    Модель(id: "wan/2-6-text-to-video", название: "Wan 2.6 — видео по тексту", вид: .видео, живая: true, требует: "описание", опасная: false, ценаUSD: 0.35, единица: "за ролик", входИзвне: false, нуженИсходник: false, видИсходника: nil), // cyrillic-ok: generated UI catalogue
    Модель(id: "wan/3-0-video", название: "Wan 3.0 — видео", вид: .видео, живая: true, требует: "описание", опасная: false, ценаUSD: 0.04, единица: "за секунду", входИзвне: false, нуженИсходник: false, видИсходника: nil), // cyrillic-ok: generated UI catalogue
    Модель(id: "topaz/video-upscale", название: "Topaz — увеличить видео", вид: .видео, живая: true, требует: "видео", опасная: false, ценаUSD: 0.04, единица: "за секунду", входИзвне: false, нуженИсходник: true, видИсходника: "видео"), // cyrillic-ok: generated UI catalogue
    Модель(id: "infinitalk/from-audio", название: "InfiniTalk — видео под голос", вид: .липсинк, живая: true, требует: "фото", опасная: false, ценаUSD: 0.015, единица: "за секунду", входИзвне: false, нуженИсходник: true, видИсходника: "фото"), // cyrillic-ok: generated UI catalogue
    Модель(id: "minimax-h3/text-to-video", название: "MiniMax H3 — видео по тексту", вид: .видео, живая: true, требует: "описание", опасная: false, ценаUSD: 0.02, единица: "за картинку", входИзвне: false, нуженИсходник: false, видИсходника: nil), // cyrillic-ok: generated UI catalogue
    Модель(id: "omnihuman-1-5", название: "OmniHuman 1.5 — липсинк", вид: .липсинк, живая: true, требует: "фото + звук", опасная: false, ценаUSD: 0.135, единица: "за секунду", входИзвне: false, нуженИсходник: true, видИсходника: "фото"), // cyrillic-ok: generated UI catalogue
    Модель(id: "volcengine/video-to-video-lip-sync", название: "Volcengine — липсинк видео", вид: .липсинк, живая: true, требует: "видео + звук", опасная: false, ценаUSD: 0.04, единица: "за секунду", входИзвне: true, нуженИсходник: true, видИсходника: "видео"), // cyrillic-ok: generated UI catalogue
    Модель(id: "elevenlabs/audio-isolation", название: "ElevenLabs — выделить голос", вид: .звук, живая: true, требует: "звук", опасная: false, ценаUSD: nil, единица: nil, входИзвне: true, нуженИсходник: true, видИсходника: "звук"), // cyrillic-ok: generated UI catalogue
    Модель(id: "elevenlabs/text-to-speech-multilingual-v2", название: "ElevenLabs — озвучка (многоязычная)", вид: .звук, живая: true, требует: "текст", опасная: false, ценаUSD: 0.06, единица: "за 1000 знаков", входИзвне: false, нуженИсходник: false, видИсходника: nil), // cyrillic-ok: generated UI catalogue
    Модель(id: "elevenlabs/text-to-speech-turbo-2-5", название: "ElevenLabs Turbo — озвучка", вид: .звук, живая: true, требует: "текст", опасная: false, ценаUSD: 0.03, единица: "за 1000 знаков", входИзвне: false, нуженИсходник: false, видИсходника: nil), // cyrillic-ok: generated UI catalogue
    Модель(id: "google/gemini-3-1-flash-tts", название: "Gemini 3.1 Flash — озвучка", вид: .звук, живая: true, требует: "описание", опасная: false, ценаUSD: nil, единица: nil, входИзвне: true, нуженИсходник: false, видИсходника: nil), // cyrillic-ok: generated UI catalogue
    Модель(id: "sora-2-text-to-video", название: "Sora 2 — видео по тексту", вид: .видео, живая: false, требует: "—", опасная: false, ценаUSD: nil, единица: nil, входИзвне: false, нуженИсходник: false, видИсходника: nil), // cyrillic-ok: generated UI catalogue
    Модель(id: "sora-2-pro-text-to-video", название: "Sora 2 Pro — видео по тексту", вид: .видео, живая: false, требует: "—", опасная: false, ценаUSD: nil, единица: nil, входИзвне: false, нуженИсходник: false, видИсходника: nil), // cyrillic-ok: generated UI catalogue
    Модель(id: "sora-2-image-to-video", название: "Sora 2 — видео из фото", вид: .видео, живая: false, требует: "—", опасная: false, ценаUSD: nil, единица: nil, входИзвне: false, нуженИсходник: false, видИсходника: nil), // cyrillic-ok: generated UI catalogue
    Модель(id: "veed/fabric-1", название: "Veed Fabric — липсинк по фото", вид: .липсинк, живая: true, требует: "фото", опасная: false, ценаUSD: nil, единица: nil, входИзвне: false, нуженИсходник: true, видИсходника: "фото"), // cyrillic-ok: generated UI catalogue
    Модель(id: "gpt-5-2", название: "GPT-5.2 — сценарий", вид: .сценарий, живая: true, требует: "тема", опасная: false, ценаUSD: nil, единица: nil, входИзвне: false, нуженИсходник: false, видИсходника: nil), // cyrillic-ok: generated UI catalogue
    Модель(id: "gemini-3-pro", название: "Gemini 3 Pro — сценарий", вид: .сценарий, живая: true, требует: "тема", опасная: false, ценаUSD: nil, единица: nil, входИзвне: false, нуженИсходник: false, видИсходника: nil), // cyrillic-ok: generated UI catalogue
    Модель(id: "gemini-2.5-flash", название: "Gemini 2.5 Flash — сценарий", вид: .сценарий, живая: true, требует: "тема", опасная: false, ценаUSD: nil, единица: nil, входИзвне: false, нуженИсходник: false, видИсходника: nil), // cyrillic-ok: generated UI catalogue
    Модель(id: "glm-5.3", название: "GLM-5.3 — сценарий", вид: .сценарий, живая: true, требует: "тема", опасная: false, ценаUSD: nil, единица: nil, входИзвне: false, нуженИсходник: false, видИсходника: nil), // cyrillic-ok: generated UI catalogue
  ]

  static func поВиду(_ в: Модель.Вид) -> [Модель] { все.filter { $0.вид == в } }
  static var живые: [Модель] { все.filter { $0.живая } }
}
