/**
 * Утилиты для работы с URL
 */

/**
 * Объединяет части URL, обрабатывая правильно слеши
 * @param baseUrl Базовый URL
 * @param paths Части пути для объединения
 * @returns Полный URL с правильно обработанными слешами
 */
export function urlJoin(baseUrl: string, ...paths: string[]): string {
  // Удаляем завершающий слеш с базового URL, если он есть
  const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl

  // Обрабатываем каждую часть пути
  const normalizedPaths = paths
    .map(path => {
      // Удаляем начальные и конечные слеши
      let normalizedPath = path

      // Удаляем начальный слеш, если он есть
      if (normalizedPath.startsWith('/')) {
        normalizedPath = normalizedPath.slice(1)
      }

      // Удаляем конечный слеш, если он есть
      if (normalizedPath.endsWith('/')) {
        normalizedPath = normalizedPath.slice(0, -1)
      }

      return normalizedPath
    })
    .filter(Boolean) // Удаляем пустые части

  // Собираем URL с правильными слешами
  if (normalizedPaths.length === 0) {
    return base
  }

  return `${base}/${normalizedPaths.join('/')}`
}
