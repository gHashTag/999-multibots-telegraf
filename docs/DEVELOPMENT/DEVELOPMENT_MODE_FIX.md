# Development Mode Fix - 2025-08-23

## Проблема
На тестовом сервере запускались все production боты вместо одного тестового, несмотря на наличие `TEST_BOT_NAME` в переменных окружения.

## Корневая причина
В Docker-контейнере `NODE_ENV=production` устанавливается по умолчанию, что блокировало запуск в development режиме даже при наличии `TEST_BOT_NAME`.

## Решение
Обновлена логика определения режима работы в `src/config/index.ts`:

```typescript
// 🔧 ИСПРАВЛЕНИЕ: Принудительный development режим через FORCE_DEV_MODE или TEST_BOT_NAME
const forceDevMode = process.env.FORCE_DEV_MODE === 'true'
const hasTestBot = !!process.env.TEST_BOT_NAME
if (forceDevMode) {
  console.log('[CONFIG] FORCE_DEV_MODE=true detected, overriding to development mode')
  ;(process.env as { NODE_ENV?: string }).NODE_ENV = 'development'
} else if (hasTestBot) {
  console.log(`[CONFIG] TEST_BOT_NAME=${process.env.TEST_BOT_NAME} detected, overriding to development mode`)
  ;(process.env as { NODE_ENV?: string }).NODE_ENV = 'development'
}

export const isDev = process.env.NODE_ENV === 'development' || forceDevMode || hasTestBot
```

## Изменения
- ✅ `TEST_BOT_NAME` автоматически активирует development режим
- ✅ `FORCE_DEV_MODE=true` принудительно включает dev режим  
- ✅ Улучшено логирование для отладки
- ✅ Обратная совместимость сохранена

## Результат
Теперь при наличии `TEST_BOT_NAME` запускается только один тестовый бот в development режиме.

## Коммиты
- `d6505ab1`: fix: исправлена логика определения development режима
- `4c57c240`: test: добавлен комментарий для проверки CI/CD pipeline