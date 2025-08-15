# Исправления Kling LipSync

## Проблема

В функции `generateKlingLipSync` были обнаружены следующие ошибки:

1. **Неправильный тип webhook**: Передавался объект вместо строки
2. **Неправильное имя параметра**: Использовался `audio_url` вместо `audio_file`
3. **Отсутствие поддержки text**: Модель поддерживает генерацию речи из текста, но это не было реализовано

## Исправления

### 1. Исправлен тип webhook

**Было:**
```typescript
webhook: webhookUrl ? {
  url: webhookUrl,
  events: ['completed'],
} : undefined
```

**Стало:**
```typescript
webhook: webhookUrl || undefined,
webhook_events_filter: webhookUrl ? ['completed'] as any : undefined,
```

### 2. Исправлено имя параметра аудио

**Было:**
```typescript
input: {
  video_url: videoUrl,
  audio_url: audioUrl,
}
```

**Стало:**
```typescript
input: {
  video_url: videoUrl,
  audio_file: audioUrl,
}
```

### 3. Добавлена поддержка генерации из текста

Теперь функция поддерживает три режима:
- С аудио файлом (приоритетный)
- С текстом (если нет аудио)
- Ошибка, если нет ни аудио, ни текста

```typescript
// Если есть аудио, используем его
if (audioUrl) {
  input.audio_file = audioUrl
} 
// Если есть текст, используем его
else if (text) {
  input.text = text
  input.voice_id = isRu ? 'ru_AOT' : 'en_AOT'
}
```

## Параметры модели Kling LipSync

Согласно документации Replicate, модель принимает следующие параметры:

- `video_url` (string) - URL видео для обработки
- `audio_file` (string, optional) - URL аудио файла (mp3, wav, m4a, aac, < 5MB)
- `text` (string, optional) - Текст для генерации речи
- `voice_id` (string, optional) - ID голоса для синтеза речи
- `voice_speed` (number, optional) - Скорость речи (по умолчанию 1.0)
- `video_id` (string, optional) - ID видео, сгенерированного Kling

## Тестирование

Для тестирования исправлений созданы два скрипта:

### 1. Тест с аудио файлом
```bash
bun scripts/test-kling-lipsync.ts
```

### 2. Тест с текстом
```bash
bun scripts/test-kling-text.ts
```

## Статус

✅ Исправления внесены и готовы к использованию. Функция теперь корректно:
- Передает webhook как строку
- Использует правильное имя параметра `audio_file`
- Поддерживает генерацию из текста
- Правильно обрабатывает ошибки

## Дальнейшие улучшения

Рекомендуется:
1. Добавить валидацию URL видео и аудио перед отправкой
2. Добавить проверку размера аудио файла (< 5MB)
3. Добавить проверку длительности видео (2-10 секунд)
4. Расширить список поддерживаемых голосов
