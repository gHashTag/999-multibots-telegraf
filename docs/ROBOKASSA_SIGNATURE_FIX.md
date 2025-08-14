# Исправление критической ошибки валидации подписи Robokassa

## Дата: 14.08.2025
## Ветка: `fix/rub-payment-critical`

## 🚨 Проблема
`TypeError: signature.toLowerCase is not a function` - функция валидации подписи Robokassa падала при обработке webhook.

## ✅ Решение
Добавлена защита от неправильных типов в `src/core/robokassa/index.ts`:
- Проверка наличия всех параметров
- Преобразование signature в строку перед использованием
- Логирование для отладки

## Изменения
```typescript
// Было: signature.toLowerCase() без проверки типа
// Стало: 
const signatureStr = String(signature)
// Используем signatureStr.toLowerCase()
```

## Важно
- Webhook обрабатывается на ai-server по адресу `/payment-success`
- URL остается как есть: `https://ai-server-u14194.vm.elestio.app/payment-success`
- Это исправление только для валидации подписи в телеграф боте

## Результат
✅ Устранена критическая ошибка TypeError
✅ Валидация подписи работает с любыми типами входных данных
