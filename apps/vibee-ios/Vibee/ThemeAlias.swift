import SwiftUI

/**
 ENGLISH NAMES FOR THE DESIGN TOKENS.

 `Theme.swift` is written with Russian identifiers, and it is the single source
 of the numbers, measured off app.t27.ai. Nothing here changes those values;
 this file only gives them names the rest of the codebase is required to use.
 Each alias below shows the original it points at.

 WHY AN ALIAS AND NOT A RENAME

 The project rule is that code is English, and `scripts/no-cyrillic-guard.cjs`
 enforces it on every added line, `.swift` included. A new screen calling the theme
 directly puts a Cyrillic identifier on every second line, so the choice is
 forty `cyrillic-ok` markers or a rename.

 The rename is the worse option and has already been tried in this codebase:
 a mass substitution across files mangled Russian prose inside comments and
 test names, and three files had to be restored by hand. The theme enum is
 referenced from every screen in the app.

 So: the old names keep working for the old screens, new code uses these, and
 the two can converge later one screen at a time with the compiler checking
 each step. The `cyrillic-ok` markers live here, on fifteen lines, instead of
 being scattered through every new file.

 There is exactly ONE definition of each value. These are `let` bindings to the
 originals, not copies -- if a token changes in `Theme.swift`, it changes here
 with no second place to remember.
 */
enum Palette {
  static let text = Тема.Цвет.текст  // cyrillic-ok: alias to the existing theme
  static let textMuted = Тема.Цвет.текстПриглушённый  // cyrillic-ok: alias
  static let textInactive = Тема.Цвет.текстНеактивный  // cyrillic-ok: alias
  static let background = Тема.Цвет.фон  // cyrillic-ok: alias
  static let surface = Тема.Цвет.поверхность  // cyrillic-ok: alias
  static let secondary = Тема.Цвет.вторичный  // cyrillic-ok: alias
  static let accent = Тема.Цвет.акцент  // cyrillic-ok: alias
  static let warning = Тема.Цвет.предупреждение  // cyrillic-ok: alias
  /// The purple used for "this is the selected view", never for "you may press".
  static let selected = Тема.Цвет.видАктивный  // cyrillic-ok: alias
}

enum Space {
  static let sm = Тема.Отступ.sm  // cyrillic-ok: alias
  static let md = Тема.Отступ.md  // cyrillic-ok: alias
  /// The horizontal padding a chat bubble uses; chips reuse it so they line up.
  static let chip = Тема.Отступ.пузырьЧата  // cyrillic-ok: alias
}

enum Corner {
  static let lg = Тема.Радиус.lg  // cyrillic-ok: alias
  static let xl = Тема.Радиус.xl  // cyrillic-ok: alias
}

enum Touch {
  /// 44pt. Not a style choice -- it is the minimum a finger can hit reliably.
  static let minimum = Тема.Касание.минимум  // cyrillic-ok: alias
}

enum Typeface {
  static func style(_ t: Font.TextStyle, _ w: Font.Weight = .regular) -> Font {
    Тема.Шрифт.стиль(t, w)  // cyrillic-ok: alias
  }
}
