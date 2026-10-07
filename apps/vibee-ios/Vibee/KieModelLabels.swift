import Foundation

/**
 The model list in the phone's language.

 `KieModels.swift` is generated (`render/scripts/gen-kie-swift.ts`) and its
 names, needs and paused reason are Russian. Hand edits there vanish on the
 next run, so the English side lives here, keyed by the generated words. The
 web names these models by brand only ("Kie · Nano Banana"); the app keeps
 the kind after the dash because one brand sells several jobs.

 The tables are closed over the words the generator writes today. A new
 suffix or need falls through unchanged -- and `KieModelLabelTests` fails on
 the first catalogue entry whose English label still has Cyrillic, so the
 table grows with the catalogue instead of after a screenshot.
 */
enum KieModelLabels {
  /// What follows " — " in a generated name.
  static let kinds: [String: String] = [  // ru-only-ok: generated words this table translates
    "картинка": "image",  // ru-only-ok: generated word
    "правка картинки": "image edit",  // ru-only-ok: generated word
    "увеличить картинку": "upscale image",  // ru-only-ok: generated word
    "увеличить резко": "crisp upscale",  // ru-only-ok: generated word
    "убрать фон": "remove background",  // ru-only-ok: generated word
    "персонаж": "character",  // ru-only-ok: generated word
    "подарок": "gift",  // ru-only-ok: generated word
    "видео": "video",  // ru-only-ok: generated word
    "видео по тексту": "text to video",  // ru-only-ok: generated word
    "видео из фото": "photo to video",  // ru-only-ok: generated word
    "видео под голос": "video to a voice",  // ru-only-ok: generated word
    "увеличить видео": "upscale video",  // ru-only-ok: generated word
    "говорящий аватар": "talking avatar",  // ru-only-ok: generated word
    "липсинк": "lip-sync",  // ru-only-ok: generated word
    "липсинк видео": "video lip-sync",  // ru-only-ok: generated word
    "липсинк по фото": "photo lip-sync",  // ru-only-ok: generated word
    "озвучка": "voiceover",  // ru-only-ok: generated word
    "озвучка (многоязычная)": "voiceover (multilingual)",  // ru-only-ok: generated word
    "выделить голос": "isolate voice",  // ru-only-ok: generated word
    "сценарий": "script",  // ru-only-ok: generated word
  ]

  /// Names whose brand part is itself Russian (a product of ours, not a vendor's).
  static let brands: [String: String] = [
    "Портрет из фото": "Portrait from a photo",  // ru-only-ok: generated word
  ]

  /// One input the model asks the person for, as the generator words it.
  static let inputs: [String: String] = [
    "описание": "prompt",  // ru-only-ok: generated word
    "текст": "text",  // ru-only-ok: generated word
    "тема": "topic",  // ru-only-ok: generated word
    "фото": "photo",  // ru-only-ok: generated word
    "картинку": "image",  // ru-only-ok: generated word
    "видео": "video",  // ru-only-ok: generated word
    "звук": "audio",  // ru-only-ok: generated word
  ]

  static func name(_ generated: String, russian: Bool = speaksRussian) -> String {
    if russian { return generated }
    guard let dash = generated.range(of: " — ") else {
      return brands[generated] ?? generated
    }
    let brand = String(generated[..<dash.lowerBound])
    let kind = String(generated[dash.upperBound...])
    return "\(brands[brand] ?? brand) — \(kinds[kind] ?? kind)"
  }

  /// "описание + фото" -> "Needs: prompt + photo". The words are joined by the  // cyrillic-ok: quotes a generated value
  /// generator with " + "; each is translated on its own.
  static func needs(_ generated: String, russian: Bool = speaksRussian) -> String {
    func l(_ en: String, _ ru: String) -> String { russian ? ru : en }
    let words = russian
      ? generated
      : generated.components(separatedBy: " + ").map { inputs[$0] ?? $0 }.joined(separator: " + ")
    return l("Needs: \(words)", "нужно: \(words)")
  }

  static func paused(russian: Bool = speaksRussian) -> String {
    func l(_ en: String, _ ru: String) -> String { russian ? ru : en }
    return l(
      "Paused by the provider — not your account. It will come back by itself.",
      "Приостановлена у провайдера — не в вашем аккаунте. Появится сама."
    )
  }

  /// The row's price. "/s" is the unit the web prints for per-second prices.
  static func price(_ tokens: Int, perSecond: Bool, russian: Bool = speaksRussian) -> String {
    let amount = russian
      ? склонение(tokens, "токен", "токена", "токенов")  // cyrillic-ok: pre-existing helper; ru-only-ok: the russian branch
      : (tokens == 1 ? "1 token" : "\(tokens) tokens")
    let unit = russian ? "с" : "s"  // ru-only-ok: the Russian per-second unit
    return perSecond ? "\(amount)/\(unit)" : amount
  }
}

extension Модель {  // cyrillic-ok: generated type
  var label: String { KieModelLabels.name(название) }  // cyrillic-ok: generated field
  var needsLabel: String { KieModelLabels.needs(требует) }  // cyrillic-ok: generated field
  /// The generated `почемуНельзя` in the phone's language.  // cyrillic-ok: generated field
  var pausedLabel: String? { живая ? nil : KieModelLabels.paused() }  // cyrillic-ok: generated field
}
