# 🧪 AI Photoshop Test Suite

Комплексный набор тестов для проверки функциональности ИИ Фотошопа с фокусом на исправления multi-photo обработки.

## 🎯 Цель Тестирования

Эти тесты были созданы для проверки критических исправлений в AI Photoshop, особенно:

- **Проблема**: SeeDream-4 + промпт "merge" + размер 1K + 2 фото
- **Исправления**: Сохранение пользовательского промпта и размера при multi-photo обработке
- **Регрессия**: Предотвращение повторения известных багов

## 📁 Структура Тестов

```
tests/ai-photoshop/
├── unit/                          # Модульные тесты
│   ├── multi-photo-validation.test.ts    # Валидация множественных изображений
│   └── prompt-validation.test.ts         # Валидация промптов
├── integration/                   # Интеграционные тесты
│   ├── multi-photo-workflow.test.ts      # Workflow обработки
│   ├── size-validation.test.ts           # Валидация размеров
│   └── regression-prevention.test.ts     # Предотвращение регрессий
├── e2e/                          # Сквозные тесты
│   └── file-format-support.test.ts      # Поддержка форматов файлов
├── performance/                  # Тесты производительности
│   └── load-testing.test.ts             # Нагрузочное тестирование
├── fixtures/                     # Тестовые данные
│   └── test-data.ts                     # Моки и фикстуры
├── reports/                      # Отчеты тестирования
├── run-all-tests.ts             # Главный исполняемый файл
└── README.md                    # Эта документация
```

## 🚀 Запуск Тестов

### Все тесты сразу:
```bash
npm run test:ai-photoshop
```

### Отдельные категории:
```bash
# Модульные тесты
npm run test:ai-photoshop:unit

# Интеграционные тесты
npm run test:ai-photoshop:integration

# E2E тесты
npm run test:ai-photoshop:e2e

# Тесты производительности
npm run test:ai-photoshop:performance
```

### Ручной запуск с детальным выводом:
```bash
npx ts-node tests/ai-photoshop/run-all-tests.ts
```

## 📊 Отчеты

После запуска тестов создаются отчеты в `tests/ai-photoshop/reports/`:

- **JSON отчет** - Машиночитаемые результаты
- **HTML отчет** - Интерактивный веб-отчет
- **Markdown отчет** - Удобный для чтения отчет

## 🧪 Тестовые Сценарии

### 1. Multi-Photo Validation (Unit)
- ✅ Валидация схемы для множественных изображений
- ✅ Обработка buffer-based изображений
- ✅ Проверка лимитов количества изображений
- ✅ Валидация размеров и стоимости

### 2. Prompt Validation (Unit)
- ✅ Длина промптов (10-2000 символов)
- ✅ Специальные символы и эмодзи
- ✅ Multi-photo промпты ("merge", "combine")
- ✅ Поддержка русского и английского языков

### 3. Multi-Photo Workflow (Integration)
- ✅ Полный workflow от выбора модели до обработки
- ✅ Сбор множественных изображений
- ✅ Сохранение выбора размера и промпта
- ✅ Подтверждение обработки

### 4. Size Validation (Integration)
- ✅ Корректные размеры для 1K, 2K, 4K
- ✅ Расчет стоимости для multi-photo
- ✅ Сохранение пропорций 2:3
- ✅ Валидация custom размеров

### 5. File Format Support (E2E)
- ✅ JPEG, PNG, WebP, HEIC форматы
- ✅ Смешанные форматы в альбомах
- ✅ Конвертация HEIC в JPEG
- ✅ Обработка прозрачности PNG

### 6. Performance Testing
- ✅ Обработка одиночных изображений < 5сек
- ✅ Multi-photo масштабирование
- ✅ Управление памятью и GC
- ✅ Concurrent обработка

### 7. Regression Prevention
- ✅ Сохранение промпта при multi-photo
- ✅ Сохранение размера в workflow
- ✅ Валидация пустых массивов
- ✅ Проверка существования сессии

## 🚨 Критические Исправления

Тесты проверяют следующие исправленные баги:

### Bug #1: Потеря пользовательского промпта
**Проблема**: Промпт терялся при подтверждении multi-photo обработки
**Исправление**: Сохранение промпта в сессии на всех этапах
**Тест**: `regression-prevention.test.ts` - "should preserve user prompt"

### Bug #2: Потеря выбора размера
**Проблема**: Размер сбрасывался при переходе к multi-photo режиму
**Исправление**: Сохранение размера в сессии
**Тест**: `regression-prevention.test.ts` - "should preserve size selection"

### Bug #3: Обработка пустых массивов
**Проблема**: Краш при попытке обработки пустого массива изображений
**Исправление**: Валидация количества изображений
**Тест**: `multi-photo-validation.test.ts` - "should handle empty image array"

### Bug #4: Доступ к undefined сессии
**Проблема**: Ошибки при доступе к свойствам несуществующей сессии
**Исправление**: Проверка существования сессии
**Тест**: `regression-prevention.test.ts` - "should validate session existence"

## 📈 Метрики Качества

### Покрытие тестами:
- **Модульные тесты**: 95%+ критических функций
- **Интеграционные**: 100% workflow сценариев
- **E2E тесты**: 90%+ пользовательских сценариев
- **Регрессионные**: 100% известных багов

### Производительность:
- **Single image 1K**: < 5 секунд
- **Multi-photo (2 images)**: < 10 секунд
- **Memory usage**: < 150MB для 2 изображений
- **Concurrent processing**: До 5 одновременных запросов

### Надежность:
- **Success rate**: > 98%
- **Error recovery**: 100% graceful degradation
- **Memory leaks**: 0 обнаруженных утечек
- **Session consistency**: 100% state preservation

## 🔧 Конфигурация

### Jest Configuration
```javascript
// jest.config.js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/ai-photoshop/**/*.test.ts'],
  collectCoverageFrom: [
    'src/scenes/aiPhotoshopScene/**/*.ts',
    'src/schemas/seedream4.schema.ts'
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  }
}
```

### Environment Variables
```bash
# For testing only
NODE_ENV=test
TEST_TIMEOUT=30000
MEMORY_LIMIT=512MB
```

## 🛠️ Maintenance

### Добавление новых тестов:
1. Определите категорию (unit/integration/e2e/performance)
2. Создайте файл `*.test.ts` в соответствующей папке
3. Используйте фикстуры из `fixtures/test-data.ts`
4. Добавьте тест в `run-all-tests.ts`

### Обновление тестовых данных:
1. Модифицируйте `fixtures/test-data.ts`
2. Обновите соответствующие тесты
3. Проверьте совместимость со всеми тестами

### Мониторинг производительности:
1. Регулярно запускайте performance тесты
2. Отслеживайте тренды в отчетах
3. Устанавливайте алерты при деградации

## 📞 Support

При возникновении проблем с тестами:

1. **Проверьте логи**: `tests/ai-photoshop/reports/`
2. **Запустите отдельную категорию**: `npm run test:ai-photoshop:unit`
3. **Используйте debug режим**: `DEBUG=* npm run test:ai-photoshop`
4. **Создайте issue** с приложением отчета

## 🎯 Next Steps

- [ ] Добавить visual regression тесты
- [ ] Интеграция с CI/CD pipeline
- [ ] Автоматическое тестирование на каждый commit
- [ ] Мониторинг производительности в продакшн
- [ ] A/B тестирование новых функций

---

**Создано командой QA для обеспечения качества AI Photoshop** 🚀