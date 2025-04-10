# 🌐 Тесты системы переводов

В этой директории содержатся тесты для проверки системы локализации проекта.

## 📋 Описание

Тесты системы переводов предназначены для проверки соответствия локализационных ключей в русской и английской версиях приложения, а также для валидации полноты перевода и корректности форматирования строк. Система тестов помогает поддерживать многоязычный интерфейс в актуальном состоянии.

## 🔍 Что проверяют тесты

1. **Проверка соответствия ключей** - убеждаемся, что все ключи из русской локализации присутствуют в английской и наоборот
2. **Валидация переменных в строках** - проверяем, что плейсхолдеры для переменных (например, `{username}`) одинаковы в обеих версиях
3. **Проверка форматирования** - тестируем, что специальные символы и форматирование текста (markdown, HTML-теги) корректно используются в обеих локализациях

## 🚀 Как запустить тесты переводов

```bash
# Через npm-скрипт
npm run test:translations

# Напрямую через runTests.ts
npx ts-node -r tsconfig-paths/register src/test-utils/core/runTests.ts --category=translations

# С подробным выводом
npx ts-node -r tsconfig-paths/register src/test-utils/core/runTests.ts --category=translations --verbose
```

## 📂 Структура

- **translationTests.ts** - содержит основную логику проверки локализаций
- **index.ts** - экспортирует функции для запуска тестов и интегрирует их в систему тестирования

## 🔄 Как добавлять новые тесты локализации

Чтобы добавить новый вид проверки локализации:

1. Откройте файл `translationTests.ts`
2. Создайте новую функцию для тестирования нужного аспекта:

```typescript
import assert from '../../core/assert'

/**
 * Тест для проверки нового аспекта локализации
 */
export async function testNewLocalizationAspect(): Promise<TestResult> {
  // Логика тестирования
  
  // Используйте assert для проверок
  assert.assert(condition, 'Условие должно быть истинным')
  
  return {
    success: true,
    message: 'Тест нового аспекта локализации успешно пройден'
  }
}
```

3. Добавьте новый тест в функцию `runTranslationTests` в файле `index.ts`:

```typescript
export async function runTranslationTests(): Promise<TestResult[]> {
  console.log('🌐 Запуск тестов переводов...')
  
  try {
    const results: TestResult[] = []
    
    // Существующие тесты
    const keysResult = await testLocalizationKeys()
    results.push(keysResult)
    
    // Добавляем новый тест
    const newAspectResult = await testNewLocalizationAspect()
    results.push(newAspectResult)
    
    return results
  } catch (error) {
    console.error('❌ Ошибка при выполнении тестов переводов:', error)
    return [{
      success: false,
      message: `Ошибка при выполнении тестов переводов: ${error.message || String(error)}`
    }]
  }
}
```

## 📊 Результаты тестирования

После запуска тестов вы увидите отчёт с информацией о пройденных/непройденных тестах. В случае обнаружения проблем будет выведено детальное описание проблемы, позволяющее быстро исправить несоответствия в локализациях. 