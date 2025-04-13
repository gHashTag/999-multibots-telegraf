# Roadmap развития тестовой инфраструктуры

## Обзор
Этот документ описывает план развития тестовой инфраструктуры на следующие 3 месяца. Целью является создание надежной, автоматизированной системы тестирования, которая обеспечит высокое качество кода, позволит быстро выявлять регрессии и упростит разработку новых функций.

## Ключевые показатели успеха
- Покрытие кода тестами: >80%
- Время выполнения всех тестов: <5 минут
- Стабильность тестов: >99% (отсутствие "мерцающих" тестов)
- Интеграция с CI/CD: автоматический запуск при каждом коммите
- Полная изоляция тестов от производственной среды

## Этап 1: Расширение тестового покрытия базовых сцен (1-2 недели)

### Приоритет: Высокий ⚠️

- [x] **Нейрофото (Flux и Flux Pro)**
  - [x] Создание изолированных тестов
  - [x] Мокирование Supabase
  - [x] Запуск в Docker-контейнере

- [ ] **Текст в видео**
  - [ ] Создание легковесных тестов по аналогии с нейрофото
  - [ ] Мокирование API для генерации видео
  - [ ] Тестирование обработки ошибок

- [ ] **Изображение в видео**
  - [ ] Базовые тесты функциональности
  - [ ] Тестирование загрузки изображений
  - [ ] Проверка валидации входных данных

- [ ] **Базовые команды бота**
  - [ ] `/start` - проверка начальной инициализации
  - [ ] `/help` - тесты отображения справки
  - [ ] `/menu` - тесты навигационного меню

### Задачи инфраструктуры
- [ ] Создать унифицированный запускатель для всех типов тестов
- [ ] Настроить автоматический запуск тестов при коммите

## Этап 2: Расширенное мокирование внешних сервисов (2-3 недели)

### Приоритет: Средний ⚠️

- [ ] **Мокирование платежных систем**
  - [ ] Создание моков для платежных API
  - [ ] Тестирование успешных платежей
  - [ ] Тестирование сценариев отказа

- [ ] **Мокирование Telegram API**
  - [ ] Улучшение моков для методов Telegram
  - [ ] Тестирование отправки медиа
  - [ ] Тестирование обработки сообщений

- [ ] **Мокирование Inngest функций**
  - [ ] Создание моков для событий
  - [ ] Тестирование очередей задач
  - [ ] Тестирование обработки фоновых задач

### Задачи инфраструктуры
- [ ] Создать реестр моков с документацией
- [ ] Настроить автоматическое переключение на моки в тестовой среде

## Этап 3: Интеграционные тесты сложных сценариев (3-4 недели)

### Приоритет: Средний ⚠️

- [ ] **Тестирование подписок**
  - [ ] Покупка подписки
  - [ ] Обновление подписки
  - [ ] Отмена подписки
  - [ ] Проверка доступа к премиум-функциям

- [ ] **Тестирование многошаговых сценариев**
  - [ ] Создание изображения → Преобразование в видео
  - [ ] Покупка подписки → Использование премиум-функций
  - [ ] Отмена подписки → Проверка ограничений

- [ ] **Тестирование уведомлений**
  - [ ] Уведомления о низком балансе
  - [ ] Уведомления о завершении задач
  - [ ] Уведомления об окончании подписки

### Задачи инфраструктуры
- [ ] Создать систему для тестирования многошаговых сценариев
- [ ] Настроить генерацию отчетов о прохождении тестов

## Этап 4: Нагрузочное тестирование и мониторинг (4-6 недель)

### Приоритет: Низкий ⚠️

- [ ] **Тестирование производительности**
  - [ ] Создание скриптов симуляции нагрузки
  - [ ] Тестирование одновременного обслуживания множества пользователей
  - [ ] Определение узких мест системы

- [ ] **Мониторинг тестов**
  - [ ] Настройка сбора метрик тестирования
  - [ ] Создание дашборда для визуализации результатов
  - [ ] Настройка алертов при падении тестов

- [ ] **Долгосрочные тесты**
  - [ ] Тестирование работы бота в течение длительного времени
  - [ ] Проверка утечек памяти
  - [ ] Мониторинг стабильности сервисов

### Задачи инфраструктуры
- [ ] Создать инфраструктуру для нагрузочного тестирования
- [ ] Интегрировать с системой мониторинга

## Этап 5: Автоматизация и CI/CD (Параллельно с другими этапами)

### Приоритет: Высокий ⚠️

- [ ] **Интеграция с GitHub Actions**
  - [ ] Настройка автоматического запуска тестов при пуш-запросах
  - [ ] Настройка уведомлений о результатах тестов
  - [ ] Блокировка мерджа при падении тестов

- [ ] **Автоматизация развертывания**
  - [ ] Создание пайплайна для автоматического развертывания
  - [ ] Настройка тестирования после развертывания
  - [ ] Автоматический откат при проблемах

- [ ] **Документация и обучение**
  - [ ] Создание подробной документации по тестированию
  - [ ] Обучение команды написанию тестов
  - [ ] Внедрение практики TDD (Test-Driven Development)

### Задачи инфраструктуры
- [ ] Настроить интеграцию с системой CI/CD
- [ ] Создать шаблоны для автоматизации

## Планирование реализации

| Этап | Неделя начала | Продолжительность | Приоритет | Статус |
|------|---------------|-------------------|-----------|--------|
| Расширение базовых сцен | Текущая | 1-2 недели | Высокий | В процессе |
| Мокирование внешних сервисов | Неделя 3 | 2-3 недели | Средний | Запланировано |
| Интеграционные тесты | Неделя 5 | 3-4 недели | Средний | Запланировано |
| Нагрузочное тестирование | Неделя 8 | 4-6 недель | Низкий | Запланировано |
| Автоматизация и CI/CD | Неделя 1 | Весь период | Высокий | Запланировано |

## Ближайшие задачи (эта неделя)

1. [ ] Создать легковесные тесты для сцены "Текст в видео"
2. [ ] Настроить базовую интеграцию с GitHub Actions
3. [ ] Расширить моки для Telegram API
4. [ ] Создать единый запускатель для всех типов тестов
5. [ ] Обновить документацию по написанию тестов

# Test Coverage Improvement Roadmap

## BalanceNotifierService Improvement Plan

**Priority: High**
**Current Coverage: 15.92%**
**Target Coverage: 85%+**

The `BalanceNotifierService` is a critical component of our notification system, ensuring users are alerted when their balance is low. Currently, this service has insufficient test coverage (15.92%), which poses a risk as changes could introduce bugs that are not caught by tests.

### Current Status

- Basic tests exist for key methods: `shouldNotifyUser`, `getUserNotificationSettings`, `sendLowBalanceNotification`, `checkAllUsersBalances`
- Most tests only cover the "happy path" scenarios
- Inngest function test for the scheduled task exists but had stability issues (recently fixed)
- Limited coverage for error handling and edge cases

### Improvement Plan

#### Phase 1: Expand Unit Tests (High Priority)

1. **shouldNotifyUser**
   - Add tests for edge cases around threshold values
   - Test with extreme balance values (very negative, very high)
   - Add tests for unusual telegram IDs (very long, special characters)

2. **getUserNotificationSettings**
   - Test handling of null/undefined settings
   - Test handling of malformed settings objects
   - Add tests for error scenarios from Supabase
   - Test caching behavior (if implemented)

3. **sendLowBalanceNotification**
   - Test message formatting for both languages
   - Test handling of Telegram API errors
   - Test behavior when bot is not found
   - Test rate limiting scenarios

4. **checkAllUsersBalances**
   - Test with empty user list
   - Test with large number of users
   - Test with users having various balance states
   - Test error handling for database exceptions
   - Test partial success (some users fail, others succeed)

5. **checkUserBalanceById**
   - Test various ID formats
   - Test non-existent users
   - Test users without telegram IDs
   - Test database error handling

#### Phase 2: Integration Tests (Medium Priority)

1. **Database Integration**
   - Test actual integration with Supabase using test database
   - Verify correct queries are being made
   - Test transaction handling if applicable

2. **Bot Integration**
   - Test with actual Telegram bot in sandbox environment
   - Verify notifications are properly formatted and delivered
   - Test handling of Telegram rate limits

3. **Scheduled Task Flow**
   - End-to-end test of the scheduled notification flow
   - Test timing and concurrency handling
   - Test with various bot configurations

#### Phase 3: Performance and Stress Tests (Lower Priority)

1. **Large Scale Testing**
   - Test with thousands of simulated users
   - Measure performance and identify bottlenecks
   - Test memory usage and potential leaks

2. **Resilience Testing**
   - Test behavior under network issues
   - Test with slow/hanging database responses
   - Test recovery from unexpected errors

### Implementation Approach

1. Create a dedicated test file for each major method
2. Use mock data generator for creating diverse test scenarios
3. Implement proper mocking of all external dependencies
4. Add logging of all test scenarios for easier debugging
5. Use parametrized tests where appropriate to test many variations

### Expected Benefits

- Identify and fix existing bugs in the notification logic
- Prevent regression when making future changes
- Document expected behavior through tests
- Improve confidence in this critical user-facing feature
- Provide examples for testing other services

### Timeline

- Phase 1: 2 weeks
- Phase 2: 2 weeks
- Phase 3: 1 week

### Dependencies

- Updated mock utilities for Supabase
- Test database instance for integration tests
- Testing Telegram bot token

---

# Existing roadmap content... 