import type { MyContext } from '@/interfaces'

/**
 * Изменяемый Telegraf-контекст ДЛЯ ТЕСТОВ.
 *
 * Тесты объявляли моки как `Partial<MyContext>`, но `Partial` СОХРАНЯЕТ
 * `readonly`. Telegraf помечает `message` и `callbackQuery` только для чтения —
 * это верно для продакшена и неверно для теста, который по замыслу мутирует
 * контекст между сценариями. Отсюда 123 ошибки TS2540 «Cannot assign to ...
 * because it is a read-only property» в девяти файлах: 101 раз `message`,
 * 16 `callbackQuery`, 6 `current`.
 *
 * `-readonly` снимает модификатор, `?` оставляет частичность.
 *
 * Тип общий, а не скопированный в каждый файл: объяснение должно лежать в одном
 * месте, иначе следующий читатель найдёт девять одинаковых комментариев и ни
 * одного источника.
 */
export type MutableCtx = { -readonly [K in keyof MyContext]?: MyContext[K] }
