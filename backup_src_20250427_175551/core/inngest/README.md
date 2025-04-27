# 🚀 Inngest Integration Guide

## 📋 Содержание
1. [Установка и настройка](#установка-и-настройка)
2. [Структура проекта](#структура-проекта)
3. [Типовые ошибки](#типовые-ошибки)
4. [Примеры использования](#примеры-использования)
5. [Компоненты](#компоненты)

## Установка и настройка

### Необходимые пакеты
```bash
pnpm install @inngest/express express
```

### Базовая конфигурация
```typescript
import { Inngest } from '@inngest/express'
import { serve } from '@inngest/express'
import express from 'express'

// Создаем клиент
const inngest = new Inngest({ id: 'neuro-blogger-2.0' })
```

## Структура проекта

```
src/core/inngest/
├── clients.ts                    # Клиенты Inngest
├── functions.ts                  # Общие функции
├── serve.ts                      # Конфигурация сервера
├── __tests__/                   # Тесты
└── services/                    # Сервисы по категориям
    ├── payment/                 # Платежные функции
    ├── generation/             # Функции генерации
    └── notifications/          # Уведомления
```

## Компоненты

### Основные модули
- `createVoiceAvatar.inngest.ts` - Создание голосового аватара
- `imageToVideo.inngest.ts` - Конвертация изображений в видео
- `neuroImageGeneration.ts` - Генерация изображений через нейросети
- `paymentProcessor.ts` - Обработка платежей
- `textToImage.inngest.ts` - Конвертация текста в изображения
- `textToSpeech.inngest.ts` - Синтез речи из текста
- `textToVideo.inngest.ts` - Создание видео из текста
- `voiceToText.inngest.ts` - Распознавание речи

## Типовые ошибки

### 1. TypeError: Inngest is not a constructor
**Проблема:** Неправильный импорт Inngest
```typescript
import { Inngest } from 'inngest' // ❌ Неправильно
```
**Решение:** Использовать правильный импорт
```typescript
import { Inngest } from '@inngest/express' // ✅ Правильно
```

### 2. Address already in use (EADDRINUSE)
**Проблема:** Порт 8288 или 8289 уже занят
**Решение:** 
1. Проверить и завершить процессы на этих портах:
```bash
lsof -i :8288
lsof -i :8289
kill -9 <PID>
```
2. Использовать другие порты в конфигурации

### 3. Ошибки с типами в функциях
**Проблема:** Несоответствие типов данных в событиях
**Решение:** Использовать правильные типы:
```typescript
interface PaymentEvent {
  name: 'payment.created'
  data: {
    amount: number
    userId: string
  }
}
```

## Примеры использования

### Создание функции
```typescript
export const processPayment = inngest.createFunction(
  { id: 'process-payment' },
  { event: 'payment.created' },
  async ({ event, step }) => {
    await step.run('process', async () => {
      // Логика обработки платежа
    })
    return { success: true }
  }
)
```

### Отправка события
```typescript
await inngest.send({
  name: 'payment.created',
  data: { 
    amount: 100,
    userId: 'user123'
  }
})
```

## Запуск Dev сервера
```bash
npx inngest-cli@latest dev -u http://localhost:3001/api/inngest
```

## Мониторинг
- Dev Dashboard: http://localhost:8288
- Логи: http://localhost:8288/logs 