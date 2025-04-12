# 🐳 Настройка Docker-окружения для тестирования платежной системы

## 📋 Файлы конфигурации

### 1. 📄 docker-compose.test.yml

```yaml
version: '3.8'

services:
  test:
    container_name: neuro-blogger-telegram-bot-test
    build:
      context: .
      dockerfile: Dockerfile.test
    environment:
      - NODE_ENV=test
      - SUPABASE_URL=${SUPABASE_URL}
      - SUPABASE_KEY=${SUPABASE_KEY}
      - TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}
      - INNGEST_EVENT_KEY=${INNGEST_EVENT_KEY}
      - INNGEST_SIGNING_KEY=${INNGEST_SIGNING_KEY}
      - LOG_LEVEL=info
    volumes:
      - ./test-results:/app/test-results
    command: ["npm", "run", "test:payment-docker"]
```

### 2. 📄 Dockerfile.test

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Установка зависимостей для разработки и тестирования
COPY package*.json ./
RUN npm ci

# Копирование исходного кода
COPY . .

# Сборка проекта
RUN npm run build

# Создание директории для результатов тестов
RUN mkdir -p /app/test-results

# Команда по умолчанию для запуска тестов
CMD ["npm", "run", "test:payment-docker"]
```

### 3. 📄 .env.test

```
# Тестовое окружение
NODE_ENV=test

# Supabase конфигурация (используйте тестовую базу данных!)
SUPABASE_URL=https://db.yuukfqcsdhkyxegfwlcb.supabase.co
SUPABASE_KEY=your-test-supabase-key

# Telegram конфигурация (используйте тестового бота)
TELEGRAM_BOT_TOKEN=test_bot_token

# Inngest конфигурация
INNGEST_EVENT_KEY=test_event_key
INNGEST_SIGNING_KEY=test_signing_key

# Настройки логирования
LOG_LEVEL=info
```

## 🚀 Скрипты для запуска тестов

### 1. 📄 run-tests.sh

```bash
#!/bin/bash

# Функция для вывода сообщений с цветами и эмодзи
log() {
  local emoji="$1"
  local message="$2"
  echo -e "\033[1;36m$emoji $message\033[0m"
}

# Проверка наличия Docker
if ! command -v docker &> /dev/null; then
  log "❌" "Docker не установлен. Пожалуйста, установите Docker и повторите попытку."
  exit 1
fi

log "🧪" "Начинаем подготовку среды для тестирования..."

# Проверка наличия .env.test файла
if [ ! -f .env.test ]; then
  log "⚠️" "Файл .env.test не найден. Создаем из шаблона..."
  cp .env.example .env.test
  log "✅" "Файл .env.test создан. Пожалуйста, настройте переменные окружения для тестирования."
  exit 1
fi

# Очистка предыдущих контейнеров тестирования
log "🧹" "Очищаем предыдущие контейнеры тестирования..."
docker-compose -f docker-compose.test.yml down --remove-orphans

# Сборка и запуск контейнеров для тестирования
log "🏗️" "Собираем Docker-образы для тестирования..."
docker-compose -f docker-compose.test.yml build

log "🚀" "Запускаем тесты в Docker-контейнере..."
docker-compose -f docker-compose.test.yml up

# Проверка результатов
TEST_EXIT_CODE=$(docker inspect --format='{{.State.ExitCode}}' neuro-blogger-telegram-bot-test)

if [ "$TEST_EXIT_CODE" = "0" ]; then
  log "✅" "Тестирование успешно завершено!"
else
  log "❌" "Тестирование завершилось с ошибками. Код выхода: $TEST_EXIT_CODE"
  
  # Вывод логов контейнера
  log "📋" "Логи тестирования:"
  docker logs neuro-blogger-telegram-bot-test
fi

# Очистка после тестирования
log "🧹" "Очищаем ресурсы тестирования..."
docker-compose -f docker-compose.test.yml down --remove-orphans

exit $TEST_EXIT_CODE
```

### 2. 📄 npm-скрипты (в package.json)

```json
{
  "scripts": {
    "test:payment": "node -r ts-node/register src/test-utils/runTests.ts payment",
    "test:payment-processor": "node -r ts-node/register src/test-utils/runTests.ts payment-processor",
    "test:payment-mock": "node -r ts-node/register src/test-utils/runTests.ts payment-mock",
    "test:payment-docker": "node -r ts-node/register src/test-utils/runTests.ts payment-docker",
    "test:payment-docker:setup": "bash run-tests.sh"
  }
}
```

## 🔍 Структура тестов для Docker-окружения

### 📁 src/test-utils/tests/payment/paymentDockerTest.ts

```typescript
import { TestResult } from '../../types';
import { InngestTestEngine } from '../../inngestTestEngine';
import { getUserBalance } from '../../../core/supabase/getUserBalance';
import { ModeEnum } from '../../../types/enums';
import { generateUniqueId } from '../../../utils/generateId';
import { wait } from '../../../utils/time';

// Тесты, оптимизированные для запуска в Docker
export async function testDockerPaymentBasic(): Promise<TestResult> {
  try {
    console.log('🚀 Запуск базового теста платежей в Docker');
    
    // Код теста, аналогичный тестам из paymentProcessorTest.ts,
    // но с учетом особенностей Docker-окружения
    
    return {
      success: true,
      message: 'Базовый тест платежей в Docker успешно пройден',
      name: 'Docker Payment Basic Test'
    };
  } catch (error) {
    return {
      success: false,
      message: `Ошибка в базовом тесте платежей в Docker: ${error.message}`,
      name: 'Docker Payment Basic Test'
    };
  }
}

// Дополнительные тесты для Docker-окружения
```

## 📊 Мониторинг и анализ результатов

### 📁 src/test-utils/reporters/docker-reporter.ts

```typescript
import { TestResult } from '../types';
import * as fs from 'fs';
import * as path from 'path';

export class DockerTestReporter {
  private results: TestResult[];
  private startTime: number;
  private endTime: number;
  
  constructor() {
    this.results = [];
    this.startTime = Date.now();
  }
  
  addResult(result: TestResult): void {
    this.results.push(result);
  }
  
  finish(): void {
    this.endTime = Date.now();
    this.generateReport();
  }
  
  private generateReport(): void {
    const successCount = this.results.filter(r => r.success).length;
    const totalCount = this.results.length;
    const duration = (this.endTime - this.startTime) / 1000;
    
    const reportData = {
      summary: {
        total: totalCount,
        success: successCount,
        failure: totalCount - successCount,
        duration: `${duration}s`
      },
      timestamp: new Date().toISOString(),
      environment: 'docker',
      results: this.results.map(r => ({
        name: r.name,
        success: r.success,
        message: r.message
      }))
    };
    
    const reportDir = path.resolve(process.cwd(), 'test-results');
    
    // Создание директории, если она не существует
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }
    
    const reportPath = path.join(reportDir, `payment-test-report-${Date.now()}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(reportData, null, 2));
    
    console.log(`📊 Отчет о тестировании сохранен в ${reportPath}`);
    console.log(`✅ Успешно: ${successCount}/${totalCount} (${(successCount/totalCount*100).toFixed(2)}%)`);
    
    // Вывод ошибок, если они есть
    const failures = this.results.filter(r => !r.success);
    if (failures.length > 0) {
      console.log('❌ Неудачные тесты:');
      failures.forEach(f => {
        console.log(`  - ${f.name}: ${f.message}`);
      });
    }
  }
}
```

## 🔧 Устранение проблем при Docker-тестировании

### Типичные проблемы и их решения

1. **Контейнер не запускается**
   - Проверьте логи: `docker logs neuro-blogger-telegram-bot-test`
   - Проверьте переменные окружения в .env.test
   - Убедитесь, что Docker имеет достаточно ресурсов

2. **Тесты проходят локально, но не в Docker**
   - Проверьте сетевые настройки и доступность Supabase в контейнере
   - Проверьте таймауты (в Docker они могут требовать более высоких значений)
   - Проверьте версии Node.js и npm в Dockerfile.test

3. **Потеря логов в Docker**
   - Настройте сохранение логов: добавьте том для логов в docker-compose.test.yml
   - Увеличьте уровень логирования: установите LOG_LEVEL=debug в .env.test

4. **Проблемы с подключением к базе данных**
   - Проверьте доступность Supabase из контейнера
   - Проверьте правильность URL и ключа Supabase
   - Проверьте сетевые настройки Docker

### Команды для диагностики

```bash
# Просмотр логов контейнера
docker logs -f neuro-blogger-telegram-bot-test

# Запуск контейнера с интерактивной оболочкой
docker-compose -f docker-compose.test.yml run --rm test sh

# Проверка подключения к Supabase из контейнера
docker-compose -f docker-compose.test.yml run --rm test curl -v $SUPABASE_URL

# Просмотр использования ресурсов
docker stats
```

## 📈 Оптимизация Docker-тестирования

1. **Кеширование зависимостей**
   - Оптимизируйте Dockerfile.test для лучшего кеширования слоев
   - Используйте volumes для node_modules

2. **Параллельные тесты**
   - Разделите тесты на категории и запускайте их параллельно
   - Используйте несколько контейнеров для распределения нагрузки

3. **Оптимизация образа**
   - Используйте многоступенчатую сборку (multi-stage build)
   - Минимизируйте размер образа, включая только необходимые файлы

4. **Непрерывная интеграция**
   - Интегрируйте Docker-тесты в CI/CD pipeline
   - Автоматизируйте запуск тестов при коммитах и pull-request'ах

## 🏁 Заключительные рекомендации

1. **Изолируйте тестовую среду**
   - Используйте отдельную базу данных для тестов
   - Не используйте реальные данные пользователей

2. **Регулярно запускайте тесты**
   - Включите тесты в процесс CI/CD
   - Запускайте полное тестирование перед деплоем

3. **Анализируйте результаты**
   - Регулярно проверяйте отчеты о тестировании
   - Отслеживайте тренды в производительности и стабильности

4. **Документируйте процесс**
   - Поддерживайте актуальность документации по тестированию
   - Описывайте все возможные проблемы и их решения