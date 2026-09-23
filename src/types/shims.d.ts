// Здесь остаётся ТОЛЬКО то, у чего нет собственных типов.
//
// `declare module 'x';` без тела — не заглушка, а ЗАМЕНА типов пакета на any.
// Если у пакета есть свои типы, такая строка их убивает молча, а ошибка
// вылезает далеко от неё. Так `declare module 'vitest';` дал 576 ошибок TS2709
// во всех тестах разом (убрано отдельным PR).
//
// Проверено по каждому:
//   apify-client  свои типы в dist/index.d.ts   -> шим убран, разницы 0
//   pg            есть @types/pg                -> шим убран, разницы 0
//   xlsx          свои типы + @types            -> шим убран, ошибок СТАЛО МЕНЬШЕ на 7
//   adm-zip       пакет НЕ УСТАНОВЛЕН           -> шим нужен, оставлен
//
// Прежде чем добавлять строку сюда: посмотри package.json пакета на поле
// types/typings и наличие @types/<пакет>. Если что-то из этого есть — шим
// не нужен и вреден.
declare module 'adm-zip'

// picomatch: no types of its own, @types/picomatch is not installed. Declare
// exactly what we use (one function) rather than a bodiless `declare module` --
// by the rule at the top of this file that would turn the whole package into
// any.
declare module 'picomatch' {
  function picomatch(
    patterns: string | string[],
    options?: { dot?: boolean }
  ): (path: string) => boolean
  export default picomatch
}
