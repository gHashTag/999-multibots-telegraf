# Настройка Fal.ai в Infisical

> Пошаговая инструкция по добавлению API ключей Fal.ai в систему управления секретами Infisical

## Содержание

1. [Получение API ключа Fal.ai](#1-получение-api-ключа-falai)
2. [Добавление ключей через веб-интерфейс Infisical](#2-добавление-ключей-через-веб-интерфейс-infisical)
3. [Добавление ключей через Infisical CLI](#3-добавление-ключей-через-infisical-cli)
4. [Проверка корректной загрузки ключей](#4-проверка-корректной-загрузки-ключей)
5. [Примеры значений для тестирования](#5-примеры-значений-для-тестирования)
6. [Troubleshooting](#6-troubleshooting)

---

## 1. Получение API ключа Fal.ai

### Шаг 1.1: Регистрация/Вход

1. Откройте браузер и перейдите на [https://fal.ai/dashboard](https://fal.ai/dashboard)
2. Войдите в свой аккаунт или зарегистрируйтесь, если у вас еще нет аккаунта

### Шаг 1.2: Создание API ключа

1. В dashboard найдите раздел **"API Keys"** или **"Settings"**
2. Нажмите кнопку **"Create API Key"** или **"Generate New Key"**
3. Дайте ключу понятное название, например: `999-agents-telegraf-dev`
4. Скопируйте созданный ключ (он будет показан только один раз!)

```
Формат ключа: fal_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**ВАЖНО:** Сохраните ключ в безопасном месте. После закрытия окна вы не сможете его увидеть снова!

### Шаг 1.3: Проверка лимитов

1. Убедитесь, что у вас есть активный план или кредиты
2. Проверьте лимиты API calls в разделе **"Usage"** или **"Billing"**

---

## 2. Добавление ключей через веб-интерфейс Infisical

### Шаг 2.1: Вход в Infisical

1. Откройте веб-интерфейс Infisical по адресу вашего instance
2. Войдите в систему используя учетные данные

### Шаг 2.2: Навигация к проекту

1. В списке проектов найдите **"999-agents-telegraf"** (или название вашего проекта)
2. Нажмите на проект для открытия
3. Выберите environment **"dev"** в выпадающем списке

### Шаг 2.3: Добавление секретов

Для каждого из следующих ключей выполните:

1. Нажмите кнопку **"Add Secret"** или **"+"**
2. Заполните поля:

#### 2.3.1 FAL_KEY (обязательный)

```
Key:   FAL_KEY
Value: fal_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Type:  Secret
```

**Описание:** Основной API ключ для доступа к Fal.ai API

#### 2.3.2 FAL_DEFAULT_LORA_PATH (опциональный)

```
Key:   FAL_DEFAULT_LORA_PATH
Value: https://your-lora-model-url.com/model.safetensors
Type:  Secret
```

**Описание:** URL к кастомной LoRA модели. Если не указан, будет использоваться дефолтная модель из кода.

**Пример значения:**
```
https://huggingface.co/username/model-name/resolve/main/lora.safetensors
```

#### 2.3.3 FAL_LORA_TRIGGER (опциональный)

```
Key:   FAL_LORA_TRIGGER
Value: NEURO_SAGE
Type:  Secret
```

**Описание:** Триггерное слово для активации LoRA модели в промпте

**Дефолтное значение:** `NEURO_SAGE`

#### 2.3.4 FAL_DEFAULT_LORA_SCALE (опциональный)

```
Key:   FAL_DEFAULT_LORA_SCALE
Value: 1.0
Type:  Secret
```

**Описание:** Интенсивность применения LoRA модели (от 0.0 до 2.0)

**Дефолтное значение:** `1.0`

**Рекомендуемый диапазон:** 0.5 - 1.5

### Шаг 2.4: Сохранение

1. Нажмите **"Save"** или **"Create"** для каждого добавленного ключа
2. Убедитесь, что все ключи отображаются в списке секретов

---

## 3. Добавление ключей через Infisical CLI

### Шаг 3.1: Установка Infisical CLI

Если CLI еще не установлен:

```bash
# macOS
brew install infisical/get-cli/infisical

# Linux
curl -1sLf 'https://dl.cloudsmith.io/public/infisical/infisical-cli/setup.deb.sh' | sudo -E bash
sudo apt-get update && sudo apt-get install -y infisical

# Windows
scoop bucket add org https://github.com/Infisical/scoop-infisical.git
scoop install infisical
```

### Шаг 3.2: Аутентификация

```bash
# Логин в Infisical
infisical login

# Или используйте service token (рекомендуется для CI/CD)
export INFISICAL_TOKEN="your-service-token"
```

### Шаг 3.3: Навигация к проекту

```bash
# Перейдите в директорию проекта
cd /Users/playra/999-agents-telegraf

# Инициализация (если еще не выполнено)
infisical init
```

### Шаг 3.4: Добавление секретов

#### Способ 1: Интерактивное добавление

```bash
# Добавление FAL_KEY
infisical secrets set FAL_KEY --env=dev

# Вам будет предложено ввести значение
# Введите: fal_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

#### Способ 2: Прямое добавление через команду

```bash
# FAL_KEY (обязательный)
infisical secrets set FAL_KEY "fal_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx" --env=dev

# FAL_DEFAULT_LORA_PATH (опциональный)
infisical secrets set FAL_DEFAULT_LORA_PATH "https://your-lora-url.com/model.safetensors" --env=dev

# FAL_LORA_TRIGGER (опциональный)
infisical secrets set FAL_LORA_TRIGGER "NEURO_SAGE" --env=dev

# FAL_DEFAULT_LORA_SCALE (опциональный)
infisical secrets set FAL_DEFAULT_LORA_SCALE "1.0" --env=dev
```

#### Способ 3: Массовое добавление из файла

Создайте временный файл `fal-secrets.env`:

```bash
FAL_KEY=fal_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
FAL_DEFAULT_LORA_PATH=https://your-lora-url.com/model.safetensors
FAL_LORA_TRIGGER=NEURO_SAGE
FAL_DEFAULT_LORA_SCALE=1.0
```

Загрузите секреты:

```bash
infisical secrets set --env=dev < fal-secrets.env

# Удалите временный файл после загрузки
rm fal-secrets.env
```

### Шаг 3.5: Проверка добавленных секретов

```bash
# Просмотр всех секретов в dev environment
infisical secrets --env=dev

# Просмотр конкретного секрета
infisical secrets get FAL_KEY --env=dev
```

---

## 4. Проверка корректной загрузки ключей

### Шаг 4.1: Проверка через код приложения

Создайте тестовый скрипт `test-fal-config.ts`:

```typescript
// test-fal-config.ts
import { config } from 'dotenv';
config();

console.log('=== FAL.AI Configuration Check ===\n');

const requiredKeys = ['FAL_KEY'];
const optionalKeys = [
  'FAL_DEFAULT_LORA_PATH',
  'FAL_LORA_TRIGGER',
  'FAL_DEFAULT_LORA_SCALE'
];

console.log('Required Keys:');
requiredKeys.forEach(key => {
  const value = process.env[key];
  const status = value ? '✓ SET' : '✗ MISSING';
  const display = value ? `${value.substring(0, 10)}...` : 'NOT SET';
  console.log(`  ${key}: ${status} (${display})`);
});

console.log('\nOptional Keys:');
optionalKeys.forEach(key => {
  const value = process.env[key];
  const status = value ? '✓ SET' : '○ Using default';
  const display = value || 'DEFAULT';
  console.log(`  ${key}: ${status} (${display})`);
});

console.log('\n=================================');
```

Запустите с Infisical:

```bash
infisical run --env=dev -- bun run test-fal-config.ts
```

Ожидаемый вывод:

```
=== FAL.AI Configuration Check ===

Required Keys:
  FAL_KEY: ✓ SET (fal_xxxxxx...)

Optional Keys:
  FAL_DEFAULT_LORA_PATH: ✓ SET (https://...)
  FAL_LORA_TRIGGER: ✓ SET (NEURO_SAGE)
  FAL_DEFAULT_LORA_SCALE: ✓ SET (1.0)

=================================
```

### Шаг 4.2: Проверка через Infisical CLI

```bash
# Экспорт всех переменных и проверка
infisical export --env=dev --format=dotenv | grep FAL_

# Ожидаемый вывод:
# FAL_KEY=fal_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# FAL_DEFAULT_LORA_PATH=https://...
# FAL_LORA_TRIGGER=NEURO_SAGE
# FAL_DEFAULT_LORA_SCALE=1.0
```

### Шаг 4.3: Проверка через запуск приложения

```bash
# Запуск приложения с Infisical
cd /Users/playra/999-agents-telegraf
infisical run --env=dev -- bun run dev

# Проверьте логи на наличие ошибок связанных с FAL_KEY
# Должно быть сообщение вида:
# "[FAL] Initialized with LoRA: <path>"
```

### Шаг 4.4: Тестовый запрос к Fal.ai API

Создайте скрипт `test-fal-api.ts`:

```typescript
// test-fal-api.ts
import * as fal from "@fal-ai/serverless-client";
import { config } from 'dotenv';
config();

fal.config({
  credentials: process.env.FAL_KEY
});

async function testFalAPI() {
  try {
    console.log('Testing Fal.ai API connection...\n');

    const result = await fal.subscribe("fal-ai/flux/schnell", {
      input: {
        prompt: "A simple test image",
        image_size: "landscape_4_3",
        num_inference_steps: 4,
        num_images: 1
      },
      logs: true,
      onQueueUpdate: (update) => {
        if (update.status === "IN_PROGRESS") {
          console.log(`Progress: ${JSON.stringify(update)}`);
        }
      },
    });

    console.log('\n✓ API Connection Successful!');
    console.log('Result:', result);
    console.log('\nImage URL:', result.images[0].url);

  } catch (error) {
    console.error('\n✗ API Connection Failed!');
    console.error('Error:', error);
  }
}

testFalAPI();
```

Запустите тест:

```bash
infisical run --env=dev -- bun run test-fal-api.ts
```

---

## 5. Примеры значений для тестирования

### 5.1: Минимальная конфигурация (только обязательные ключи)

```bash
# Только FAL_KEY - остальное использует дефолты из кода
FAL_KEY=fal_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### 5.2: Базовая конфигурация

```bash
FAL_KEY=fal_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
FAL_LORA_TRIGGER=NEURO_SAGE
FAL_DEFAULT_LORA_SCALE=1.0
```

### 5.3: Полная конфигурация с кастомной LoRA

```bash
FAL_KEY=fal_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
FAL_DEFAULT_LORA_PATH=https://huggingface.co/username/neuro-sage-lora/resolve/main/lora.safetensors
FAL_LORA_TRIGGER=NEURO_SAGE
FAL_DEFAULT_LORA_SCALE=1.2
```

### 5.4: Конфигурация для экспериментов

```bash
FAL_KEY=fal_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
FAL_DEFAULT_LORA_PATH=https://civitai.com/api/download/models/your-model-id
FAL_LORA_TRIGGER=cyberpunk_style
FAL_DEFAULT_LORA_SCALE=0.8
```

### 5.5: Примеры публичных LoRA моделей для тестирования

```bash
# Стиль аниме
FAL_DEFAULT_LORA_PATH=https://huggingface.co/stabilityai/anime-lora/resolve/main/lora.safetensors
FAL_LORA_TRIGGER=anime style

# Реалистичные портреты
FAL_DEFAULT_LORA_PATH=https://huggingface.co/models/realistic-vision/resolve/main/lora.safetensors
FAL_LORA_TRIGGER=realistic photo

# Cyberpunk стиль
FAL_DEFAULT_LORA_PATH=https://huggingface.co/models/cyberpunk-lora/resolve/main/lora.safetensors
FAL_LORA_TRIGGER=cyberpunk neon
```

---

## 6. Troubleshooting

### Проблема: "FAL_KEY is not defined"

**Симптомы:**
```
Error: FAL_KEY is not defined
```

**Решения:**
1. Проверьте, что секрет добавлен в Infisical:
   ```bash
   infisical secrets get FAL_KEY --env=dev
   ```

2. Убедитесь, что запускаете приложение через `infisical run`:
   ```bash
   infisical run --env=dev -- bun run dev
   ```

3. Проверьте `.env` файл (должен содержать только Infisical credentials):
   ```bash
   cat .env | grep INFISICAL
   ```

### Проблема: "Invalid Fal.ai API key"

**Симптомы:**
```
Error: 401 Unauthorized - Invalid API key
```

**Решения:**
1. Проверьте формат ключа (должен начинаться с `fal_`):
   ```bash
   infisical secrets get FAL_KEY --env=dev | grep "^fal_"
   ```

2. Убедитесь, что ключ не содержит лишних пробелов:
   ```bash
   # Обновите ключ, удалив пробелы
   infisical secrets set FAL_KEY "$(echo 'fal_xxxxx' | xargs)" --env=dev
   ```

3. Создайте новый ключ на [fal.ai/dashboard](https://fal.ai/dashboard)

### Проблема: "LoRA model not found"

**Симптомы:**
```
Error: Failed to load LoRA model from URL
```

**Решения:**
1. Проверьте доступность URL:
   ```bash
   curl -I "$(infisical secrets get FAL_DEFAULT_LORA_PATH --env=dev --plain)"
   ```

2. Убедитесь, что URL указывает на `.safetensors` файл

3. Попробуйте убрать `FAL_DEFAULT_LORA_PATH` и использовать дефолтную модель:
   ```bash
   infisical secrets delete FAL_DEFAULT_LORA_PATH --env=dev
   ```

### Проблема: Infisical не загружает переменные

**Симптомы:**
```
Environment variables not loaded
```

**Решения:**
1. Проверьте аутентификацию:
   ```bash
   infisical login
   ```

2. Проверьте инициализацию проекта:
   ```bash
   cd /Users/playra/999-agents-telegraf
   cat .infisical.json
   ```

3. Переинициализируйте проект:
   ```bash
   infisical init --force
   ```

### Проблема: Rate limit exceeded

**Симптомы:**
```
Error: 429 Too Many Requests
```

**Решения:**
1. Проверьте лимиты на [fal.ai/dashboard](https://fal.ai/dashboard)
2. Добавьте rate limiting в код
3. Обновите тарифный план

### Проблема: Разные значения в разных environments

**Решение:**
Убедитесь, что указываете правильный environment:

```bash
# Для development
infisical secrets set FAL_KEY "dev-key" --env=dev

# Для production
infisical secrets set FAL_KEY "prod-key" --env=prod

# Для staging
infisical secrets set FAL_KEY "staging-key" --env=staging
```

---

## Дополнительные ресурсы

- [Fal.ai Documentation](https://fal.ai/docs)
- [Fal.ai Dashboard](https://fal.ai/dashboard)
- [Infisical Documentation](https://infisical.com/docs)
- [Infisical CLI Reference](https://infisical.com/docs/cli/overview)

---

## Чеклист настройки

Используйте этот чеклист для проверки:

- [ ] Создан аккаунт на Fal.ai
- [ ] Получен API ключ (FAL_KEY)
- [ ] Ключ добавлен в Infisical (environment: dev)
- [ ] Опциональные параметры настроены (если нужно)
- [ ] Проверка через `infisical secrets --env=dev` успешна
- [ ] Тестовый скрипт выполнен успешно
- [ ] Приложение запускается без ошибок
- [ ] Тестовый запрос к API выполнен успешно
- [ ] Документация обновлена с правильными значениями

---

**Последнее обновление:** 2025-11-12
