import Foundation

/**
 * Ниши и стили сценария — те же, что в вебе.
 *
 * Список взят из `player/src/pages/Script.tsx`, а не выдуман: две витрины,
 * предлагающие разный выбор, — это два разных продукта в глазах человека,
 * который пользуется обоими.
 *
 * Человеку показываем по-русски, серверу шлём КЛЮЧ на латинице: он попадает
 * в промпт модели дословно (`in the ${niche} niche`), и русское слово там
 * сработало бы хуже английского на англоязычной модели.
 */
enum КаталогСценария {
  static let ниши = [
    "Крипто", "Фитнес", "Технологии", "Бизнес", "Лайфстайл", "Путешествия",  // ru-only-ok: values are server keys, shown via label()
    "Еда", "Мода", "Игры", "Образование", "Развлечения", "Красота",  // ru-only-ok: values are server keys, shown via label()
    "Мотивация", "Другое",  // ru-only-ok: values are server keys, shown via label()
  ]

  static let стили = [
    "Обучающий", "Развлекательный", "Рекламный", "Сторителлинг",  // ru-only-ok: values are server keys, shown via label()
    "Профессиональный", "Разговорный", "Энергичный", "Спокойный",  // ru-only-ok: values are server keys, shown via label()
  ]

  private static let ключиНиш = [
    "Крипто": "crypto", "Фитнес": "fitness", "Технологии": "tech",
    "Бизнес": "business", "Лайфстайл": "lifestyle", "Путешествия": "travel",
    "Еда": "food", "Мода": "fashion", "Игры": "gaming",
    "Образование": "education", "Развлечения": "entertainment",
    "Красота": "beauty", "Мотивация": "motivation", "Другое": "general",
  ]

  private static let ключиСтилей = [
    "Обучающий": "educational", "Развлекательный": "entertaining",
    "Рекламный": "promotional", "Сторителлинг": "storytelling",
    "Профессиональный": "professional", "Разговорный": "conversational",
    "Энергичный": "energetic", "Спокойный": "calm",
  ]

  /// English labels, word for word from the web (`SCRIPT_NICHE_OPTIONS` and
  /// `SCRIPT_STYLE_OPTIONS` labelEn in vibee-atoms defaults.ts).
  private static let english = [
    "Крипто": "Crypto", "Фитнес": "Fitness", "Технологии": "Tech",
    "Бизнес": "Business", "Лайфстайл": "Lifestyle", "Путешествия": "Travel",
    "Еда": "Food", "Мода": "Fashion", "Игры": "Gaming",
    "Образование": "Education", "Развлечения": "Entertainment",
    "Красота": "Beauty", "Мотивация": "Motivation", "Другое": "Other",
    "Обучающий": "Educational", "Развлекательный": "Entertaining",
    "Рекламный": "Promotional", "Сторителлинг": "Storytelling",
    "Профессиональный": "Professional", "Разговорный": "Casual",
    "Энергичный": "Energetic", "Спокойный": "Calm",
  ]

  /// What the chip shows. The Russian name stays the VALUE: saved templates
  /// and the server keys below are built on it.
  static func label(_ name: String, russian: Bool = speaksRussian) -> String {
    russian ? name : (english[name] ?? name)
  }

  /// Ключ для сервера. Неизвестное имя даёт «general», а не пустую строку:
  /// пустая ниша попала бы в промпт как « in the  niche» — мусор в задании.
  static func ключНиши(_ имя: String) -> String { ключиНиш[имя] ?? "general" }
  static func ключСтиля(_ имя: String) -> String { ключиСтилей[имя] ?? "educational" }
}
