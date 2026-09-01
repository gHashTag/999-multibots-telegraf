import SwiftUI

/**
 * Каталог KieAI на устройстве — 44 модели, СГЕНЕРИРОВАН из серверного реестра.
 *
 * ПОЧЕМУ СГЕНЕРИРОВАН, А НЕ НАПИСАН. Два списка, которые надо помнить
 * пополнять, расходятся всегда — этот репозиторий уже платил за такое, когда
 * маршрут забыли внести в публичный список и он молча отвечал 401. Источник
 * один: `apps/vibee-editor/render/src/agent/kie-models.ts`, добытый замером.
 * Тест `kie-swift-sync.test.ts` сверяет два файла и падает при расхождении.
 *
 * ЧТО ЗНАЧАТ ПОЛЯ. `живая` и `требует` — не догадки: KieAI на неполный запрос
 * отвечает, каких полей не хватает, и эти ответы легли в реестр дословно.
 * Приостановленные ПОКАЗАНЫ и помечены: спрятать их значило бы сказать, что
 * Sora у нас нет вовсе.
 *
 * ПРО `опасная`. Одна модель — grok-imagine/image-to-video — не проверяет вход
 * и СОЗДАЁТ задание даже на пустой запрос. Разведка по ней стоила денег
 * дважды. Здесь она помечена, чтобы никакой будущий автопробник её не тронул.
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

  enum Вид: String, CaseIterable { case картинка, видео, звук, липсинк }

  var почемуНельзя: String? {
    живая ? nil : "Приостановлена у провайдера — не в вашем аккаунте. Появится сама."
  }
}

enum КаталогKie {
  static let все: [Модель] = [
    Модель(id: "seedream/5-lite-text-to-image", название: "Seedream 5 Lite — картинка", вид: .картинка, живая: true, требует: "—", опасная: false),
    Модель(id: "seedream/5-pro-text-to-image", название: "Seedream 5 Pro — картинка", вид: .картинка, живая: true, требует: "—", опасная: false),
    Модель(id: "seedream/5-pro-image-to-image", название: "Seedream 5 Pro — правка картинки", вид: .картинка, живая: true, требует: "—", опасная: false),
    Модель(id: "google/imagen4-fast", название: "Imagen 4 Fast — картинка", вид: .картинка, живая: true, требует: "описание", опасная: false),
    Модель(id: "google/imagen4-ultra", название: "Imagen 4 Ultra — картинка", вид: .картинка, живая: true, требует: "—", опасная: false),
    Модель(id: "google/imagen4", название: "Imagen 4 — картинка", вид: .картинка, живая: true, требует: "—", опасная: false),
    Модель(id: "google/nano-banana-edit", название: "Nano Banana — правка картинки", вид: .картинка, живая: true, требует: "описание", опасная: false),
    Модель(id: "google/nano-banana", название: "Nano Banana — картинка", вид: .картинка, живая: true, требует: "описание", опасная: false),
    Модель(id: "grok-imagine/text-to-image", название: "Grok Imagine — картинка", вид: .картинка, живая: true, требует: "—", опасная: false),
    Модель(id: "grok-imagine/image-to-image", название: "Grok Imagine — правка картинки", вид: .картинка, живая: true, требует: "—", опасная: false),
    Модель(id: "topaz/image-upscale", название: "Topaz — увеличить картинку", вид: .картинка, живая: true, требует: "фото", опасная: false),
    Модель(id: "recraft/remove-background", название: "Recraft — убрать фон", вид: .картинка, живая: true, требует: "картинку", опасная: false),
    Модель(id: "recraft/crisp-upscale", название: "Recraft — увеличить резко", вид: .картинка, живая: true, требует: "картинку", опасная: false),
    Модель(id: "ideogram/v3-text-to-image", название: "Ideogram v3 — картинка", вид: .картинка, живая: true, требует: "—", опасная: false),
    Модель(id: "ideogram/character", название: "Ideogram — персонаж", вид: .картинка, живая: true, требует: "описание", опасная: false),
    Модель(id: "qwen/text-to-image", название: "Qwen — картинка", вид: .картинка, живая: true, требует: "описание", опасная: false),
    Модель(id: "qwen/image-edit", название: "Qwen — правка картинки", вид: .картинка, живая: true, требует: "описание", опасная: false),
    Модель(id: "qwen3/text-to-image", название: "Qwen 3 — картинка", вид: .картинка, живая: true, требует: "—", опасная: false),
    Модель(id: "wan/2-7-image", название: "Wan 2.7 — картинка", вид: .картинка, живая: true, требует: "—", опасная: false),
    Модель(id: "grok-imagine/text-to-video", название: "Grok Imagine — видео по тексту", вид: .видео, живая: true, требует: "описание", опасная: false),
    Модель(id: "grok-imagine/image-to-video", название: "Grok Imagine — видео из фото", вид: .видео, живая: true, требует: "—", опасная: true),
    Модель(id: "kling/ai-avatar-standard", название: "Kling — говорящий аватар", вид: .липсинк, живая: true, требует: "фото", опасная: false),
    Модель(id: "kling/v2-1-pro", название: "Kling 2.1 Pro — видео", вид: .видео, живая: true, требует: "—", опасная: false),
    Модель(id: "kling/v3-turbo-text-to-video", название: "Kling 3 Turbo — видео по тексту", вид: .видео, живая: true, требует: "—", опасная: false),
    Модель(id: "bytedance/seedance-2", название: "Seedance 2 — видео", вид: .видео, живая: true, требует: "описание", опасная: false),
    Модель(id: "bytedance/seedance-2-fast", название: "Seedance 2 Fast — видео", вид: .видео, живая: true, требует: "описание", опасная: false),
    Модель(id: "bytedance/v1-pro-text-to-video", название: "ByteDance v1 Pro — видео по тексту", вид: .видео, живая: true, требует: "—", опасная: false),
    Модель(id: "hailuo/02-text-to-video-pro", название: "Hailuo 02 Pro — видео по тексту", вид: .видео, живая: true, требует: "описание", опасная: false),
    Модель(id: "wan/2-5-text-to-video", название: "Wan 2.5 — видео по тексту", вид: .видео, живая: true, требует: "описание", опасная: false),
    Модель(id: "wan/2-6-text-to-video", название: "Wan 2.6 — видео по тексту", вид: .видео, живая: true, требует: "—", опасная: false),
    Модель(id: "wan/3-0-video", название: "Wan 3.0 — видео", вид: .видео, живая: true, требует: "описание", опасная: false),
    Модель(id: "topaz/video-upscale", название: "Topaz — увеличить видео", вид: .видео, живая: true, требует: "видео", опасная: false),
    Модель(id: "infinitalk/from-audio", название: "InfiniTalk — видео под голос", вид: .липсинк, живая: true, требует: "фото", опасная: false),
    Модель(id: "minimax-h3/text-to-video", название: "MiniMax H3 — видео по тексту", вид: .видео, живая: true, требует: "—", опасная: false),
    Модель(id: "omnihuman-1-5", название: "OmniHuman 1.5 — липсинк", вид: .липсинк, живая: true, требует: "—", опасная: false),
    Модель(id: "volcengine/video-to-video-lip-sync", название: "Volcengine — липсинк видео", вид: .липсинк, живая: true, требует: "—", опасная: false),
    Модель(id: "elevenlabs/audio-isolation", название: "ElevenLabs — выделить голос", вид: .звук, живая: true, требует: "аудио", опасная: false),
    Модель(id: "elevenlabs/text-to-speech-multilingual-v2", название: "ElevenLabs — озвучка (многоязычная)", вид: .звук, живая: true, требует: "текст", опасная: false),
    Модель(id: "elevenlabs/text-to-speech-turbo-2-5", название: "ElevenLabs Turbo — озвучка", вид: .звук, живая: true, требует: "текст", опасная: false),
    Модель(id: "google/gemini-3-1-flash-tts", название: "Gemini 3.1 Flash — озвучка", вид: .звук, живая: true, требует: "—", опасная: false),
    Модель(id: "sora-2-text-to-video", название: "Sora 2 — видео по тексту", вид: .видео, живая: false, требует: "—", опасная: false),
    Модель(id: "sora-2-pro-text-to-video", название: "Sora 2 Pro — видео по тексту", вид: .видео, живая: false, требует: "—", опасная: false),
    Модель(id: "sora-2-image-to-video", название: "Sora 2 — видео из фото", вид: .видео, живая: false, требует: "—", опасная: false),
    Модель(id: "veed/fabric-1", название: "Veed Fabric — липсинк по фото", вид: .липсинк, живая: true, требует: "фото", опасная: false),
  ]

  static var живые: [Модель] { все.filter(\.живая) }

  static func поВиду(_ в: Модель.Вид) -> [Модель] { все.filter { $0.вид == в } }
}

/// Строка выбора: живые нажимаются, приостановленные видны и объяснены.
struct СтрокаМоделиKie: View {
  let модель: Модель
  let выбрана: Bool
  let нажать: () -> Void

  var body: some View {
    Button(action: нажать) {
      HStack(spacing: 12) {
        VStack(alignment: .leading, spacing: 3) {
          Text(модель.название)
            .font(Тема.Шрифт.стиль(.subheadline))
            .foregroundStyle(модель.живая ? Тема.Цвет.текст : Тема.Цвет.текстПриглушённый)

          if let причина = модель.почемуНельзя {
            Text(причина)
              .font(Тема.Шрифт.стиль(.caption))
              .foregroundStyle(Тема.Цвет.предупреждение)
              .fixedSize(horizontal: false, vertical: true)
          } else {
            Text("нужно: \(модель.требует)")
              .font(Тема.Шрифт.стиль(.caption))
              .foregroundStyle(Тема.Цвет.текстПриглушённый)
          }
        }
        Spacer(minLength: 8)
        if выбрана && модель.живая {
          Image(systemName: "checkmark").foregroundStyle(Тема.Цвет.акцент)
        }
      }
      .padding(.vertical, 10)
      .padding(.horizontal, 14)
      // 44pt — минимальная цель касания в HIG; две мелкие подписи дают меньше.
      .frame(minHeight: 44)
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(
        выбрана ? Тема.Цвет.акцент.opacity(0.08) : Color.clear,
        in: RoundedRectangle(cornerRadius: 10)
      )
    }
    .buttonStyle(.plain)
    .disabled(!модель.живая)
  }
}
