/**
 * Тестовый файл для проверки разных способов импорта Inngest
 */
// Вариант 1: Прямой экспорт (ESModules)
import * as Inngest from 'inngest'
console.log('Вариант 1:', Inngest)

// Вариант 2: Именованный импорт
import { Inngest as InngestNamed } from 'inngest'
console.log('Вариант 2:', InngestNamed)

// Вариант 3: Импорт через require (CommonJS)
const InngestCJS = require('inngest')
console.log('Вариант 3:', InngestCJS)

// Вариант 4: Альтернативные пути импорта
try {
  const { Inngest: InngestAlt } = require('inngest/client')
  console.log('Вариант 4.1 (client):', InngestAlt)
} catch (e) {
  console.log('Ошибка в варианте 4.1:', e.message)
}

try {
  const { Inngest: InngestAlt2 } = require('inngest/dist/client')
  console.log('Вариант 4.2 (dist/client):', InngestAlt2)
} catch (e) {
  console.log('Ошибка в варианте 4.2:', e.message)
}

try {
  import('inngest/client')
    .then(module => {
      console.log('Вариант 4.3 (динамический импорт):', module)
    })
    .catch(e => {
      console.log('Ошибка в варианте 4.3:', e.message)
    })
} catch (e) {
  console.log('Общая ошибка в варианте 4.3:', e.message)
}

try {
  const InngestNamespace = require('inngest')
  console.log('Структура модуля:', Object.keys(InngestNamespace))

  // Проверка наличия Inngest в экспорте модуля
  if (InngestNamespace.Inngest) {
    console.log('Найден экспорт Inngest:', InngestNamespace.Inngest)
  } else if (InngestNamespace.createClient) {
    console.log('Найден createClient:', InngestNamespace.createClient)
  } else {
    console.log('Ни Inngest, ни createClient не найдены в экспорте')
  }
} catch (e) {
  console.log('Ошибка при анализе структуры:', e.message)
}

// Проверяем версию inngest
try {
  const pkg = require('inngest/package.json')
  console.log('Версия inngest:', pkg.version)
} catch (e) {
  console.log('Не удалось определить версию:', e.message)
}
