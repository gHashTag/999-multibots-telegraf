/**
 * Собирает ссылку на обученную модель Replicate в виде `owner/slug:hash`.
 *
 * ЗАЧЕМ ОТДЕЛЬНЫЙ ФАЙЛ. Правило жило внутри шага Inngest-функции, и проверить
 * его можно было только копией в тесте — то есть тестом, который сверяет код
 * сам с собой. Такие тесты у меня уже были зелёными всё время, пока код был
 * сломан (см. docs/audit/event-seams.md). Вынесено, чтобы тест звал настоящую
 * функцию.
 *
 * ЧТО БЫЛО СЛОМАНО. Ссылка собиралась так:
 *
 *   `${replicateUsername}/${trainingRecord.model_name}:${output.version}`
 *
 * Две ошибки сразу:
 *   1. `model_name` — имя, которое ввёл ЧЕЛОВЕК: «Anneya», «Мой аватар».
 *      У Replicate имя другое: строчный слаг с меткой времени.
 *   2. `output.version` от Replicate — уже ПОЛНАЯ ссылка `owner/slug:hash`,
 *      а не голый хеш.
 *
 * В базу попадало
 *   `jalisawallet-coder/Anneya:jalisawallet-coder/anneya-1773937126432:d365…`
 * — путь, которого не существует. Проверено на живых данных: у трёх человек
 * такие записи, при этом настоящие модели отвечают 200. Потеряна ссылка, а не
 * модель.
 */
export function buildModelUrl(
  rawVersion: string,
  replicateUsername: string,
  displayName: string
): string {
  const version = String(rawVersion || '')

  // Replicate прислал готовую ссылку — её и берём. Дописывать к ней что-либо
  // и есть та самая ошибка.
  if (version.includes('/') && version.includes(':')) return version

  // Голый хеш: собираем сами. Имя приводим к тому виду, который Replicate
  // вообще принимает, — только строчные буквы, цифры и дефис.
  const slug =
    String(displayName || '')
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'model'

  return `${replicateUsername}/${slug}:${version}`
}
